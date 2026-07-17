#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { assertTenantBoundaries } from './ark-boundaries.mjs'

const arkRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]

  if (!command || command === 'help' || args.help) {
    printHelp()
    return
  }

  if (command === 'dev') {
    await dev(args)
    return
  }

  if (command === 'status') {
    status(args)
    return
  }

  if (command === 'kill') {
    kill(args)
    return
  }

  if (command === 'port-cell') {
    portCell(args)
    return
  }

  if (command === 'worktree') {
    worktree(args)
    return
  }

  if (command === 'db') {
    db(args)
    return
  }

  if (command === 'docker') {
    docker(args)
    return
  }

  if (command === 'preflight') {
    preflight(args)
    return
  }

  if (command === 'boundaries') {
    assertTenantBoundaries(process.cwd())
    console.log('Ark tenant boundaries passed.')
    return
  }

  if (command === 'path') {
    console.log(resolveArkPath(...args._.slice(1)))
    return
  }

  throw new Error(`Unknown ark command: ${command}`)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--')
      continue

    if (!value.startsWith('--')) {
      args._.push(value)
      continue
    }

    const equalIndex = value.indexOf('=')
    if (equalIndex > 2) {
      args[value.slice(2, equalIndex)] = value.slice(equalIndex + 1)
      continue
    }

    const key = value.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }

    args[key] = next
    index += 1
  }
  return args
}

function parsePort(value, fallback = 5400) {
  const raw = value ?? fallback
  const port = Number.parseInt(String(raw), 10)
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new Error(`Invalid port: ${raw}`)
  return port
}

function envWithDotenv(baseEnv = process.env) {
  const env = { ...baseEnv }
  loadDotenv({
    path: resolve(process.cwd(), '.env'),
    processEnv: env,
    quiet: true,
  })
  return env
}

export function envWithPortCell(baseEnv = process.env, options = {}) {
  const env = envWithDotenv(baseEnv)
  if (options.port)
    env.PORT = String(options.port)

  const port = parsePort(env.PORT || '5400')
  const root = findWorkspaceRoot(process.cwd())

  env.PORT ||= String(port)
  env.POSTGRES_PORT ||= String(port + 1)
  env.RUSTFS_PORT ||= String(port + 2)
  env.RUSTFS_CONSOLE_PORT ||= String(port + 3)
  env.DB_DATA_DIR ||= resolve(root, '.ark', String(port), 'database')
  env.STORAGE_LOCAL_ROOT ||= resolve(root, '.ark', String(port), 'uploads')

  return { env, port }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    cwd: options.cwd,
    encoding: options.encoding,
  })

  if (options.returnResult)
    return result

  if (result.status !== 0)
    process.exit(result.status ?? 1)

  return result
}

async function dev(args) {
  const baseEnv = envWithDotenv(process.env)
  const port = parsePort(args.port ?? baseEnv.PORT ?? 5400)
  const host = String(args.host ?? baseEnv.HOST ?? '127.0.0.1')
  const localOrigin = `http://127.0.0.1:${port}`
  const postgresConfig = resolveDevPostgresConfig(baseEnv, { pgprefix: args.pgprefix, port })
  const env = composeDevEnv({
    args,
    baseEnv: postgresConfig ? devPostgresEnv(baseEnv, postgresConfig) : baseEnv,
    host,
    localOrigin,
    port,
  })

  if (postgresConfig)
    await ensureDevPostgresDatabase(postgresConfig, { reset: Boolean(args.reset) })
  else if (args.reset)
    resetPortCell(findWorkspaceRoot(process.cwd()), port)

  console.log(`Ark local origin: ${localOrigin}`)
  console.log(`Ark public origin: ${env.BETTER_AUTH_URL}`)

  if (!args['skip-migrate'])
    db({ ...args, _: ['db', 'migrate'] }, env)

  if (!args['skip-setup'])
    runTenantSetup(env)

  if (args['setup-only']) {
    console.log('Ark dev setup is ready.')
    return
  }

  run('pnpm', ['exec', 'nuxt', 'dev', '--host', host, '--port', String(port)], { env })
}

export function composeDevEnv(options) {
  const { args, baseEnv, host, localOrigin, port } = options
  const publicUrl = String(options.publicUrl || args['public-url'] || baseEnv.BETTER_AUTH_URL || localOrigin).replace(/\/+$/, '')
  const publicHost = hostnameFromOrigin(publicUrl)
  const localOrigins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]
  const trustedOrigins = unique([
    publicUrl,
    ...localOrigins,
    ...splitList(baseEnv.BETTER_AUTH_TRUSTED_ORIGINS),
  ])
  const allowedHosts = unique([
    ...splitList(baseEnv.VITE_ALLOWED_HOSTS),
    publicHost,
  ])
  const env = {
    ...baseEnv,
    HOST: host,
    NUXT_IGNORE_LOCK: '1',
    PORT: String(port),
    BETTER_AUTH_URL: publicUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins.join(','),
    NUXT_PUBLIC_SITE_URL: baseEnv.NUXT_PUBLIC_SITE_URL || publicUrl,
    VITE_HMR_ORIGIN: baseEnv.VITE_HMR_ORIGIN || baseEnv.NUXT_HMR_ORIGIN || publicUrl,
  }

  if (allowedHosts.length)
    env.VITE_ALLOWED_HOSTS = allowedHosts.join(',')
  if (baseEnv.VITE_HMR_HOST || baseEnv.NUXT_HMR_HOST)
    env.VITE_HMR_HOST = baseEnv.VITE_HMR_HOST || baseEnv.NUXT_HMR_HOST
  if (baseEnv.VITE_HMR_PORT || baseEnv.NUXT_HMR_PORT) {
    env.VITE_HMR_PORT = String(parsePort(baseEnv.VITE_HMR_PORT || baseEnv.NUXT_HMR_PORT))
    env.NUXT_HMR_PORT = env.VITE_HMR_PORT
  }
  if (baseEnv.VITE_HMR_CLIENT_PORT || baseEnv.NUXT_HMR_CLIENT_PORT) {
    env.VITE_HMR_CLIENT_PORT = String(parsePort(baseEnv.VITE_HMR_CLIENT_PORT || baseEnv.NUXT_HMR_CLIENT_PORT))
  }
  else if (publicUrl.startsWith('https://')) {
    env.VITE_HMR_CLIENT_PORT = '443'
  }
  if (baseEnv.VITE_HMR_PROTOCOL || baseEnv.NUXT_HMR_PROTOCOL)
    env.VITE_HMR_PROTOCOL = baseEnv.VITE_HMR_PROTOCOL || baseEnv.NUXT_HMR_PROTOCOL
  else if (publicUrl.startsWith('https://'))
    env.VITE_HMR_PROTOCOL = 'wss'

  return env
}

export function resolveDevPostgresConfig(env, options = {}) {
  const rawPrefix = options.pgprefix === true ? env.DATABASE_PREFIX : (options.pgprefix ?? env.DATABASE_PREFIX)
  const prefix = String(rawPrefix ?? '').trim()
  if (!prefix && options.pgprefix === true)
    throw new Error('DATABASE_PREFIX is required when --pgprefix is passed without a value.')
  if (!prefix)
    return null
  if (!/^[a-z][a-z0-9_]*$/.test(prefix))
    throw new Error(`Invalid database prefix: ${prefix}`)

  const sourceValue = String(env.DATABASE_URL || '').trim()
  if (!sourceValue)
    throw new Error('DATABASE_URL is required when --pgprefix or DATABASE_PREFIX is set.')

  const sourceUrl = parsePostgresUrl(sourceValue, 'DATABASE_URL')
  const port = parsePort(options.port ?? env.PORT ?? 5400)
  const sourceDatabase = databaseNameFromUrl(sourceUrl)
  const targetDatabase = `${prefix}_${port}`

  assertSafeDevDatabaseName(targetDatabase)
  if (sourceDatabase === targetDatabase)
    throw new Error(`Refusing to target source database ${targetDatabase}.`)

  const runtimeUrl = new URL(sourceUrl)
  runtimeUrl.pathname = `/${encodeURIComponent(targetDatabase)}`

  return {
    host: sourceUrl.host,
    port,
    prefix,
    sourceDatabase,
    sourceUrl: sourceUrl.toString(),
    targetDatabase,
    runtimeUrl: runtimeUrl.toString(),
  }
}

export function devPostgresEnv(baseEnv, config) {
  return {
    ...baseEnv,
    DB_CLIENT: 'postgres',
    DATABASE_URL: config.runtimeUrl,
    DATABASE_PREFIX: config.prefix,
    PORT: String(config.port),
  }
}

function parsePostgresUrl(value, name) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
      throw new Error('unsupported protocol')
    return url
  }
  catch {
    throw new Error(`${name} must be a valid postgres:// or postgresql:// URL.`)
  }
}

function databaseNameFromUrl(url) {
  return decodeURIComponent(url.pathname.replace(/^\/+/, ''))
}

function assertSafeDevDatabaseName(value) {
  if (!/^[a-z][a-z0-9_]*_\d+$/.test(value))
    throw new Error(`Refusing unsafe dev database name: ${value}`)
}

async function ensureDevPostgresDatabase(config, options = {}) {
  const postgres = (await import('postgres')).default
  const sql = postgres(config.sourceUrl, {
    max: 1,
    idle_timeout: 1,
    connect_timeout: 10,
  })

  try {
    if (options.reset)
      await resetDevPostgresDatabase(sql, config.targetDatabase)

    const existing = await sql`
      select 1
      from pg_database
      where datname = ${config.targetDatabase}
      limit 1
    `

    if (existing.length) {
      console.log(`Database already exists: ${config.targetDatabase}`)
      return
    }

    await sql.unsafe(`create database ${quoteIdentifier(config.targetDatabase)}`)
    console.log(`Created database: ${config.targetDatabase}`)
  }
  finally {
    await sql.end({ timeout: 5 })
  }
}

async function resetDevPostgresDatabase(sql, targetDatabase) {
  console.log(`Resetting database: ${targetDatabase}`)
  await sql`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${targetDatabase}
      and pid <> pg_backend_pid()
  `
  await sql.unsafe(`drop database if exists ${quoteIdentifier(targetDatabase)}`)
}

function quoteIdentifier(value) {
  assertSafeDevDatabaseName(value)
  return `"${value.replaceAll('"', '""')}"`
}

export function resetPortCell(root, port) {
  const dataDir = resolve(root, '.ark', String(port))
  rmSync(dataDir, { force: true, recursive: true })
  console.log(`Removed ${dataDir}`)
}

function runTenantSetup(env) {
  const commands = tenantSetupCommands(process.cwd())
  for (const command of commands) {
    console.log(`\nTenant setup: ${command}`)
    runShell(command, { env: envWithLocalBin(env) })
  }
}

export function tenantSetupCommands(root) {
  const pkg = readPackageJson(root)
  const setup = pkg.ark?.dev?.setup
  if (!setup)
    return []
  if (Array.isArray(setup))
    return setup.map(String).filter(Boolean)
  if (typeof setup === 'string' && setup.trim())
    return [setup.trim()]
  throw new Error('package.json ark.dev.setup must be a command string or an array of command strings')
}

function readPackageJson(root) {
  const path = resolve(root, 'package.json')
  if (!existsSync(path))
    return {}
  return JSON.parse(readFileSync(path, 'utf8'))
}

function runShell(command, options = {}) {
  const result = spawnSync(command, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    shell: true,
    stdio: options.stdio ?? 'inherit',
  })
  if (result.status !== 0)
    process.exit(result.status ?? 1)
}

function envWithLocalBin(env) {
  return {
    ...env,
    PATH: [resolve(process.cwd(), 'node_modules', '.bin'), env.PATH].filter(Boolean).join(':'),
  }
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function hostnameFromOrigin(origin) {
  try {
    return new URL(origin).hostname
  }
  catch {
    return ''
  }
}

function status() {
  const args = parseArgs(process.argv.slice(2))
  const { env, port } = envWithPortCell(process.env, { port: args.port })
  const root = findWorkspaceRoot(process.cwd())
  const arkDir = resolve(root, '.ark')
  const cells = listCells(arkDir)
  const branch = gitOutput(['branch', '--show-current']) || '(detached)'
  const worktree = gitOutput(['rev-parse', '--show-toplevel']) || process.cwd()

  console.log(`Worktree: ${worktree}`)
  console.log(`Branch: ${branch}`)
  console.log(`Workspace root: ${root}`)
  console.log(`Current port: ${port}`)
  console.log(`Data root: ${resolve(arkDir, String(port))}`)
  console.log(`Database: ${env.DB_DATA_DIR || resolve(arkDir, String(port), 'database')}`)
  console.log(`Uploads: ${env.STORAGE_LOCAL_ROOT || resolve(arkDir, String(port), 'uploads')}`)
  console.log('')

  if (!cells.length) {
    console.log(`No .ark port cells found at ${arkDir}`)
    return
  }

  console.log('Port cells:')
  for (const cell of cells) {
    const pids = listeningPids(cell)
    console.log(`  ${cell}${pids.length ? ` (listener pids: ${pids.join(', ')})` : ''}`)
  }
}

function kill(args) {
  const dryRun = Boolean(args['dry-run'])
  const arkRootPath = resolve(findWorkspaceRoot(process.cwd()), '.ark')

  if (!existsSync(arkRootPath)) {
    console.log(`No .ark directory found at ${arkRootPath}`)
    return
  }

  const ports = listCells(arkRootPath)
  const listeners = new Map(ports.map(port => [port, listeningPids(port)]))
  const pids = [...new Set([...listeners.values()].flat())]

  if (ports.length)
    console.log(`Found .ark cells for ports: ${ports.join(', ')}`)
  else
    console.log('Found .ark, but no numeric port cells under it.')

  for (const [port, portPids] of listeners) {
    if (portPids.length)
      console.log(`Port ${port} listener pids: ${portPids.join(', ')}`)
  }

  if (dryRun) {
    if (pids.length)
      console.log(`Would terminate pids: ${pids.join(', ')}`)
    console.log(`Would remove ${arkRootPath}`)
    return
  }

  if (pids.length) {
    console.log(`Terminating pids: ${pids.join(', ')}`)
    for (const pid of pids)
      signalPid(pid, 'SIGTERM')

    sleep(800)

    const remaining = [...new Set(ports.flatMap(port => listeningPids(port)))]
    if (remaining.length) {
      console.log(`Force killing remaining pids: ${remaining.join(', ')}`)
      for (const pid of remaining)
        signalPid(pid, 'SIGKILL')
    }
  }

  rmSync(arkRootPath, { recursive: true, force: true })
  console.log(`Removed ${arkRootPath}`)
}

function portCell(args) {
  const command = args._[1]
  const commandArgs = args._.slice(2)
  if (!command)
    throw new Error('Usage: ark port-cell <command> [...args]')

  const { env } = envWithPortCell(process.env, { port: args.port })
  run(command, commandArgs, { env })
}

function worktree(args) {
  const subcommand = args._[1]
  if (subcommand !== 'create')
    throw new Error('Usage: ark worktree create <slug> --branch <branch> --port <port>')

  const slug = validateSlug(args._[2])
  const branch = validateBranch(args.branch)
  const port = parsePort(args.port)
  const root = requiredGitOutput(['rev-parse', '--show-toplevel'])
  const worktreeRoot = resolve(dirname(root), `${basename(root)}-worktrees`)
  const target = resolve(worktreeRoot, slug)

  if (existsSync(target))
    throw new Error(`Worktree path already exists: ${target}`)

  mkdirSync(worktreeRoot, { recursive: true })
  const branchExists = gitStatus(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]) === 0
  const addArgs = branchExists
    ? ['worktree', 'add', target, branch]
    : ['worktree', 'add', target, '-b', branch]

  run('git', addArgs)

  const sourceEnv = resolve(root, '.env')
  const targetEnv = resolve(target, '.env')
  if (existsSync(sourceEnv) && !existsSync(targetEnv))
    copyFileSync(sourceEnv, targetEnv)

  console.log(`Created worktree: ${target}`)
  console.log(`Branch: ${branch}`)
  console.log(`Port: ${port}`)
  console.log('')
  console.log('Run:')
  console.log(`  cd ${shellQuote(target)}`)
  console.log(`  pnpm dev --port ${port}`)
}

function db(args, baseEnv = process.env) {
  const subcommand = args._[1]
  if (subcommand === 'migrate-core') {
    const { env } = envWithPortCell(baseEnv, { port: args.port })
    run('pnpm', ['--dir', arkRoot, 'exec', 'drizzle-kit', 'migrate'], { env })
    return
  }

  if (subcommand === 'migrate-app') {
    const { env } = envWithPortCell(baseEnv, { port: args.port })
    run('pnpm', ['exec', 'drizzle-kit', 'migrate'], { env })
    return
  }

  if (subcommand === 'migrate') {
    db({ ...args, _: ['db', 'migrate-core'] }, baseEnv)
    db({ ...args, _: ['db', 'migrate-app'] }, baseEnv)
    return
  }

  throw new Error('Usage: ark db migrate-core | migrate-app | migrate')
}

function docker(args) {
  const subcommand = args._[1]
  if (subcommand !== 'up' && subcommand !== 'down')
    throw new Error('Usage: ark docker up | down')

  const { env } = envWithPortCell(process.env, { port: args.port })
  const dockerArgs = ['compose', '-f', resolveArkPath('docker-compose.yml'), subcommand]
  if (subcommand === 'up')
    dockerArgs.push('-d')
  run('docker', dockerArgs, { env })
}

function preflight(args) {
  const preflightPath = resolveArkPath('scripts', 'ark-preflight.ts')
  run('tsx', [preflightPath, ...process.argv.slice(3).filter(arg => arg !== 'preflight')], {
    env: process.env,
  })
}

function resolveArkPath(...segments) {
  return resolve(arkRoot, ...segments)
}

function findWorkspaceRoot(start) {
  let current = resolve(start)
  while (true) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml')))
      return current

    const parent = dirname(current)
    if (parent === current)
      return start

    current = parent
  }
}

function listCells(arkDir) {
  if (!existsSync(arkDir))
    return []

  return readdirSync(arkDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && isPortName(entry.name))
    .map(entry => Number(entry.name))
    .sort((a, b) => a - b)
}

function isPortName(name) {
  if (!/^\d+$/.test(name))
    return false

  const port = Number(name)
  return Number.isInteger(port) && port > 0 && port <= 65535
}

function listeningPids(port) {
  const result = spawnSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })

  if (result.error?.code === 'ENOENT') {
    console.warn('lsof is not available; active listeners cannot be reported.')
    return []
  }

  if (result.status !== 0 && !result.stdout.trim())
    return []

  return [...new Set(result.stdout.split(/\s+/).filter(Boolean).map(Number).filter(Number.isInteger))]
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function signalPid(pid, signal) {
  try {
    process.kill(pid, signal)
    return true
  }
  catch (error) {
    if (error?.code !== 'ESRCH')
      console.warn(`Could not ${signal} pid ${pid}: ${error.message}`)
    return false
  }
}

function gitOutput(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return result.status === 0 ? result.stdout.trim() : ''
}

function requiredGitOutput(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
  })
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`)
  return result.stdout.trim()
}

function gitStatus(args) {
  return spawnSync('git', args, { stdio: 'ignore' }).status ?? 1
}

function validateSlug(value) {
  const slug = String(value ?? '').trim()
  if (!/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(slug) || slug.includes('..') || slug.includes('/'))
    throw new Error('Missing or invalid slug. Use a path-safe value like "auth-flow".')
  return slug
}

function validateBranch(value) {
  const branch = String(value ?? '').trim()
  if (!branch || /\s/.test(branch) || branch.startsWith('-'))
    throw new Error('Missing or invalid --branch, e.g. --branch codex/auth-flow')
  return branch
}

function shellQuote(value) {
  return `'${String(value).replaceAll('\'', '\'\\\'\'')}'`
}

function printHelp() {
  console.log(`Usage:
  ark dev --port 5412 [--host 127.0.0.1] [--public-url https://p5412-dev.example.test]
  ark dev --port 5412 --pgprefix app_dev [--reset]
  ark status
  ark kill [--dry-run]
  ark port-cell <command> [...args]
  ark worktree create <slug> --branch <branch> --port <port>
  ark db migrate-core | migrate-app | migrate
  ark docker up | down
  ark preflight [--production]
  ark boundaries
  ark path [...segments]`)
}

function shouldRunMain() {
  if (!process.argv[1])
    return false
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  }
  catch {
    return false
  }
}

if (shouldRunMain()) {
  main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
  })
}
