#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const launchAgentLabel = 'com.kurark.ark-tunnels'
export const menuBarLaunchAgentLabel = 'com.kurark.ark-tunnels-menubar'
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const domainPattern = /^(?!.*\.\.)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const placeholderTokens = new Set(['', 'TODO', 'REPLACE_ME', 'replace-me'])

export function paths(home = homedir()) {
  const configRoot = join(home, '.config', 'ark-tunnels')
  const stableRoot = join(home, '.local', 'share', 'ark-tunnels')
  return {
    configPath: join(configRoot, 'backends.json'),
    configRoot,
    generatedRoot: join(configRoot, 'generated'),
    horseConfigPath: join(home, '.config', 'horse-tunnels', 'projects.json'),
    launchAgentPath: join(home, 'Library', 'LaunchAgents', `${launchAgentLabel}.plist`),
    menuBarAppPath: join(home, 'Applications', 'Ark Tunnels.app'),
    menuBarBuildRoot: join(stableRoot, 'menubar-build'),
    menuBarLaunchAgentPath: join(home, 'Library', 'LaunchAgents', `${menuBarLaunchAgentLabel}.plist`),
    stableRoot,
    stableScriptPath: join(stableRoot, 'ark-tunnels.mjs'),
    statusPath: join(configRoot, 'status.json'),
  }
}

function menuBarSourceRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'ark-tunnels-menubar')
}

export function parseArgs(argv) {
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

export function normalizeLabel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function parseRanges(ranges) {
  if (!Array.isArray(ranges) || !ranges.length)
    throw new Error('autoExpose.ranges must include at least one port or range')
  return ranges.map((value) => {
    const match = String(value).trim().match(/^([1-9]\d{0,4})(?:-([1-9]\d{0,4}))?$/)
    if (!match)
      throw new Error(`Invalid auto-expose range: ${value}`)
    const from = Number(match[1])
    const to = Number(match[2] || match[1])
    if (from > 65535 || to > 65535 || from > to)
      throw new Error(`Invalid auto-expose range: ${value}`)
    return [from, to]
  })
}

export function backendEnabled(backend) {
  return backend.enabled !== false
}

export function autoExposeEnabled(backend) {
  return backendEnabled(backend) && backend.autoExpose?.enabled !== false
}

export function mappingLabel(backend, mapping) {
  return `${mapping.label}-${backend.slug}`
}

export function autoLabel(backend, port) {
  return `p${port}-${backend.slug}`
}

export function mappingUrl(backend, mapping) {
  return `https://${mapping.resolvedLabel || mappingLabel(backend, mapping)}.${backend.domain}`
}

export function validateConfig(config) {
  const errors = []
  const ids = new Set()
  for (const backend of config.backends || []) {
    const prefix = backend.id || '<missing-id>'
    if (!backend.id || !dnsLabel.test(backend.id))
      errors.push(`${prefix}: id must be a DNS-safe label`)
    else if (ids.has(backend.id))
      errors.push(`${prefix}: duplicate backend id`)
    ids.add(backend.id)

    // Disabled entries may be kept as incomplete templates. Validate their
    // identity so enabling one cannot collide, but do not require credentials.
    if (!backendEnabled(backend))
      continue

    if (!backend.domain || backend.domain.includes('://') || backend.domain.startsWith('*.') || !domainPattern.test(backend.domain))
      errors.push(`${prefix}: domain must be a plain base domain`)
    if (!backend.serverAddr)
      errors.push(`${prefix}: serverAddr is required`)
    if (!Number.isInteger(Number(backend.serverPort)) || Number(backend.serverPort) < 1 || Number(backend.serverPort) > 65535)
      errors.push(`${prefix}: serverPort must be 1-65535`)
    if (!backend.slug || !dnsLabel.test(backend.slug))
      errors.push(`${prefix}: slug must be a DNS-safe label`)
    if (placeholderTokens.has(String(backend.token || '').trim()))
      errors.push(`${prefix}: token is required`)

    try {
      if (autoExposeEnabled(backend))
        parseRanges(backend.autoExpose?.ranges)
    }
    catch (error) {
      errors.push(`${prefix}: ${error.message}`)
    }

    const labels = new Set()
    for (const mapping of backend.mappings || []) {
      if (mapping.enabled === false)
        continue
      if (!mapping.label || !dnsLabel.test(mapping.label))
        errors.push(`${prefix}: mapping label must be a DNS-safe label`)
      if (!Number.isInteger(Number(mapping.localPort)) || Number(mapping.localPort) < 1 || Number(mapping.localPort) > 65535)
        errors.push(`${prefix}/${mapping.label || '<missing-label>'}: localPort must be 1-65535`)
      const label = mapping.label && backend.slug ? mappingLabel(backend, mapping) : ''
      if (label.length > 63 || (label && !dnsLabel.test(label)))
        errors.push(`${prefix}/${mapping.label || '<missing-label>'}: final hostname must be one DNS label up to 63 characters`)
      if (labels.has(label))
        errors.push(`${prefix}/${mapping.label}: duplicate hostname`)
      labels.add(label)
    }
  }
  errors.push(...overlapErrors(config))
  return errors
}

export function overlapErrors(config) {
  const errors = []
  const enabled = (config.backends || []).filter(autoExposeEnabled)
  for (let leftIndex = 0; leftIndex < enabled.length; leftIndex += 1) {
    const left = enabled[leftIndex]
    let leftRanges
    try {
      leftRanges = parseRanges(left.autoExpose?.ranges)
    }
    catch {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < enabled.length; rightIndex += 1) {
      const right = enabled[rightIndex]
      if (left.domain !== right.domain)
        continue
      let rightRanges
      try {
        rightRanges = parseRanges(right.autoExpose?.ranges)
      }
      catch {
        continue
      }
      if (leftRanges.some(([leftFrom, leftTo]) => rightRanges.some(([rightFrom, rightTo]) => leftFrom <= rightTo && rightFrom <= leftTo)))
        errors.push(`${left.id} and ${right.id}: auto-expose ranges overlap on ${left.domain}`)
    }
  }
  return errors
}

export function resolvedMappings(backend, listeners) {
  const explicit = (backend.mappings || [])
    .filter(mapping => mapping.enabled !== false)
    .map(mapping => ({
      ...mapping,
      localIP: mapping.localIP || '127.0.0.1',
      resolvedLabel: mappingLabel(backend, mapping),
      source: 'explicit',
    }))
  const labels = new Set(explicit.map(mapping => mapping.resolvedLabel))
  if (!autoExposeEnabled(backend))
    return explicit
  const ranges = parseRanges(backend.autoExpose.ranges)
  const automatic = [...listeners.keys()]
    .filter(port => ranges.some(([from, to]) => port >= from && port <= to))
    .sort((left, right) => left - right)
    .map(port => ({
      enabled: true,
      label: `p${port}`,
      localIP: '127.0.0.1',
      localPort: port,
      resolvedLabel: autoLabel(backend, port),
      source: 'auto',
    }))
    .filter(mapping => !labels.has(mapping.resolvedLabel))
  return [...explicit, ...automatic]
}

export function renderFrpcToml(config, backend, listeners) {
  const mappings = resolvedMappings(backend, listeners)
  const lines = [
    `serverAddr = ${tomlString(backend.serverAddr)}`,
    `serverPort = ${Number(backend.serverPort)}`,
    '',
    'auth.method = "token"',
    `auth.token = ${tomlString(backend.token)}`,
    '',
  ]
  for (const mapping of mappings) {
    lines.push(
      '[[proxies]]',
      `name = ${tomlString(`${backend.id}-${mapping.resolvedLabel}`)}`,
      'type = "http"',
      `localIP = ${tomlString(mapping.localIP)}`,
      `localPort = ${Number(mapping.localPort)}`,
      `subdomain = ${tomlString(mapping.resolvedLabel)}`,
      '',
    )
  }
  return { mappings, toml: lines.join('\n') }
}

export function migrateHorseConfig(config) {
  return {
    frpcBin: config.frpcBin,
    backends: (config.backends || []).map((backend) => ({
      id: backend.id,
      name: backend.name,
      enabled: backend.enabled,
      domain: backend.domain,
      serverAddr: backend.serverAddr,
      serverPort: backend.serverPort,
      token: backend.token,
      slug: backend.slug || normalizeLabel(`${backend.id}${backend.suffix || ''}`),
      autoExpose: {
        enabled: backend.autoExpose?.enabled !== false,
        ranges: backend.autoExpose?.ranges || ['3000-4000'],
      },
      mappings: (backend.mappings || []).map(mapping => ({
        label: mapping.label || mapping.slug,
        localIP: mapping.localIP,
        localPort: mapping.localPort,
        enabled: mapping.enabled,
      })),
    })),
  }
}

export function listeningPorts() {
  const result = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN'], { encoding: 'utf8', stdio: 'pipe' })
  const listeners = new Map()
  if (result.status !== 0)
    return listeners
  for (const line of String(result.stdout || '').split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9)
      continue
    const match = parts.slice(8).join(' ').match(/:(\d+)\s+\(LISTEN\)$/)
    if (match)
      listeners.set(Number(match[1]), { command: parts[0], pid: Number(parts[1]) })
  }
  return listeners
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  }
  catch {
    return fallback
  }
}

export function readConfig(home = homedir()) {
  return readJson(paths(home).configPath, { backends: [] })
}

function writeJson(path, value, mode = 0o600) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`)
  chmodSync(temp, mode)
  renameSync(temp, path)
}

function findFrpc(config) {
  const candidates = [config.frpcBin, '/opt/homebrew/bin/frpc', '/usr/local/bin/frpc'].filter(Boolean)
  return candidates.find(existsSync) || candidates[0]
}

function renderAgentPlist(nodePath, scriptPath, home) {
  const logRoot = paths(home).configRoot
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(launchAgentLabel)}</string>
  <key>ProgramArguments</key>
  <array><string>${xml(nodePath)}</string><string>${xml(scriptPath)}</string><string>agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(join(logRoot, 'agent.log'))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logRoot, 'agent.err.log'))}</string>
</dict>
</plist>
`
}

function renderMenuBarInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>ArkTunnelsMenuBar</string>
  <key>CFBundleIdentifier</key><string>com.kurark.ark-tunnels-menubar</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>Ark Tunnels</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
`
}

function renderMenuBarLaunchAgentPlist(executablePath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(menuBarLaunchAgentLabel)}</string>
  <key>ProgramArguments</key><array><string>${xml(executablePath)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
</dict>
</plist>
`
}

function launchTarget() {
  return `gui/${process.getuid()}/${launchAgentLabel}`
}

function launchGui() {
  return `gui/${process.getuid()}`
}

function install(home) {
  const targetPaths = paths(home)
  mkdirSync(targetPaths.stableRoot, { recursive: true })
  copyFileSync(fileURLToPath(import.meta.url), targetPaths.stableScriptPath)
  chmodSync(targetPaths.stableScriptPath, 0o755)
  mkdirSync(targetPaths.configRoot, { recursive: true })

  if (!existsSync(targetPaths.configPath)) {
    const horseConfig = readJson(targetPaths.horseConfigPath, null)
    const config = horseConfig ? migrateHorseConfig(horseConfig) : { backends: [] }
    writeJson(targetPaths.configPath, config)
    console.log(horseConfig ? `Migrated ${targetPaths.horseConfigPath}` : `Created ${targetPaths.configPath}`)
  }

  const config = readConfig(home)
  const errors = validateConfig(config)
  if (errors.length)
    throw new Error(`Invalid ${targetPaths.configPath}:\n- ${errors.join('\n- ')}`)
  const frpcBin = findFrpc(config)
  if (!frpcBin || !existsSync(frpcBin))
    throw new Error('frpc is required. Install it with `brew install frpc` or set frpcBin in the tunnel config.')

  mkdirSync(dirname(targetPaths.launchAgentPath), { recursive: true })
  writeFileSync(targetPaths.launchAgentPath, renderAgentPlist(process.execPath, targetPaths.stableScriptPath, home))
  spawnSync('launchctl', ['bootout', launchTarget()], { stdio: 'ignore' })
  const result = spawnSync('launchctl', ['bootstrap', launchGui(), targetPaths.launchAgentPath], { encoding: 'utf8', stdio: 'pipe' })
  if (result.status !== 0)
    throw new Error(`Could not install ${launchAgentLabel}: ${result.stderr || result.stdout}`)
  console.log(`Installed ${launchAgentLabel}`)
  console.log(`Config: ${targetPaths.configPath}`)
}

function restart() {
  const result = spawnSync('launchctl', ['kickstart', '-k', launchTarget()], { encoding: 'utf8', stdio: 'pipe' })
  if (result.status !== 0)
    throw new Error(`Could not restart ${launchAgentLabel}: ${result.stderr || result.stdout}`)
  console.log(`Restarted ${launchAgentLabel}`)
}

function uninstall(home) {
  const targetPaths = paths(home)
  spawnSync('launchctl', ['bootout', launchTarget()], { stdio: 'ignore' })
  rmSync(targetPaths.launchAgentPath, { force: true })
  rmSync(targetPaths.stableRoot, { force: true, recursive: true })
  rmSync(targetPaths.statusPath, { force: true })
  console.log(`Uninstalled ${launchAgentLabel}; preserved ${targetPaths.configPath}`)
}

function installMenuBar(home) {
  if (process.platform !== 'darwin')
    throw new Error('The Ark Tunnels menu-bar app requires macOS.')

  const sourceRoot = menuBarSourceRoot()
  const sourcePackage = join(sourceRoot, 'Package.swift')
  if (!existsSync(sourcePackage))
    throw new Error(`Menu-bar app sources are missing at ${sourceRoot}. Reinstall @kurark/ark.`)

  const targetPaths = paths(home)
  const buildArgs = ['build', '--package-path', sourceRoot, '--scratch-path', targetPaths.menuBarBuildRoot, '--configuration', 'release']
  const build = spawnSync('/usr/bin/swift', buildArgs, { encoding: 'utf8', stdio: 'pipe' })
  if (build.status !== 0)
    throw new Error(`Could not build Ark Tunnels menu-bar app:\n${build.stderr || build.stdout}`)

  const binPathResult = spawnSync('/usr/bin/swift', [...buildArgs, '--show-bin-path'], { encoding: 'utf8', stdio: 'pipe' })
  if (binPathResult.status !== 0)
    throw new Error(`Could not locate the Ark Tunnels menu-bar binary:\n${binPathResult.stderr || binPathResult.stdout}`)

  const appContents = join(targetPaths.menuBarAppPath, 'Contents')
  const appExecutable = join(appContents, 'MacOS', 'ArkTunnelsMenuBar')
  rmSync(targetPaths.menuBarAppPath, { force: true, recursive: true })
  mkdirSync(dirname(appExecutable), { recursive: true })
  copyFileSync(join(binPathResult.stdout.trim(), 'ArkTunnelsMenuBar'), appExecutable)
  chmodSync(appExecutable, 0o755)
  writeFileSync(join(appContents, 'Info.plist'), renderMenuBarInfoPlist())

  mkdirSync(dirname(targetPaths.menuBarLaunchAgentPath), { recursive: true })
  writeFileSync(targetPaths.menuBarLaunchAgentPath, renderMenuBarLaunchAgentPlist(appExecutable))
  const target = `gui/${process.getuid()}/${menuBarLaunchAgentLabel}`
  spawnSync('launchctl', ['bootout', target], { stdio: 'ignore' })
  const result = spawnSync('launchctl', ['bootstrap', launchGui(), targetPaths.menuBarLaunchAgentPath], { encoding: 'utf8', stdio: 'pipe' })
  if (result.status !== 0)
    throw new Error(`Could not start ${menuBarLaunchAgentLabel}: ${result.stderr || result.stdout}`)

  console.log(`Installed ${targetPaths.menuBarAppPath}`)
}

function uninstallMenuBar(home) {
  const targetPaths = paths(home)
  const target = `gui/${process.getuid()}/${menuBarLaunchAgentLabel}`
  spawnSync('launchctl', ['bootout', target], { stdio: 'ignore' })
  rmSync(targetPaths.menuBarLaunchAgentPath, { force: true })
  rmSync(targetPaths.menuBarAppPath, { force: true, recursive: true })
  console.log('Uninstalled Ark Tunnels menu-bar app.')
}

function status(home, json) {
  const targetPaths = paths(home)
  const config = readConfig(home)
  const state = readJson(targetPaths.statusPath, null)
  const loaded = spawnSync('launchctl', ['print', launchTarget()], { stdio: 'ignore' }).status === 0
  const output = {
    agent: { label: launchAgentLabel, loaded, pid: state?.pid || null, updatedAt: state?.updatedAt || null },
    backends: state?.backends || [],
    configPath: targetPaths.configPath,
    errors: [...validateConfig(config), ...(state?.errors || [])],
  }
  if (json) {
    console.log(JSON.stringify(output))
    return
  }
  console.log(`Ark Tunnels agent: ${loaded ? 'loaded' : 'not loaded'}${output.agent.pid ? ` (pid ${output.agent.pid})` : ''}`)
  console.log(`Config: ${targetPaths.configPath}`)
  for (const backend of output.backends) {
    console.log(`\n${backend.name || backend.id}: ${backend.running ? `running (pid ${backend.pid})` : 'stopped'}`)
    for (const mapping of backend.mappings || [])
      console.log(`  ${mapping.url} => ${mapping.localIP}:${mapping.localPort}`)
  }
  for (const error of output.errors)
    console.log(`ERROR: ${error}`)
}

async function stopChild(item) {
  if (!item?.child || item.child.exitCode !== null)
    return
  item.child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolvePromise => item.child.once('exit', resolvePromise)),
    new Promise(resolvePromise => setTimeout(resolvePromise, 1500)),
  ])
  if (item.child.exitCode === null)
    item.child.kill('SIGKILL')
}

async function runAgent(home, once = false) {
  const targetPaths = paths(home)
  const children = new Map()
  let stopping = false

  const stopAll = async () => {
    await Promise.all([...children.values()].map(stopChild))
  }
  const requestStop = () => {
    stopping = true
  }
  process.on('SIGTERM', requestStop)
  process.on('SIGINT', requestStop)

  while (!stopping) {
    const config = readConfig(home)
    const errors = validateConfig(config)
    const listeners = listeningPorts()
    const desiredIds = new Set()
    const backendStates = []

    if (!errors.length) {
      const frpcBin = findFrpc(config)
      if (!frpcBin || !existsSync(frpcBin))
        errors.push('frpc is not installed or frpcBin does not exist')
      for (const backend of (config.backends || []).filter(backendEnabled)) {
        if (errors.length)
          break
        const rendered = renderFrpcToml(config, backend, listeners)
        if (!rendered.mappings.length) {
          await stopChild(children.get(backend.id))
          children.delete(backend.id)
          backendStates.push({
            id: backend.id,
            name: backend.name,
            pid: null,
            running: false,
            mappings: [],
          })
          continue
        }
        desiredIds.add(backend.id)
        const frpcConfigPath = join(targetPaths.generatedRoot, backend.id, 'frpc.toml')
        const hash = createHash('sha256').update(rendered.toml).digest('hex')
        let item = children.get(backend.id)
        if (!item || item.hash !== hash || item.child.exitCode !== null) {
          await stopChild(item)
          mkdirSync(dirname(frpcConfigPath), { recursive: true })
          writeFileSync(frpcConfigPath, rendered.toml)
          chmodSync(frpcConfigPath, 0o600)
          const logFd = openSync(join(dirname(frpcConfigPath), 'frpc.log'), 'a')
          const errorFd = openSync(join(dirname(frpcConfigPath), 'frpc.err.log'), 'a')
          const child = spawn(frpcBin, ['-c', frpcConfigPath], { stdio: ['ignore', logFd, errorFd] })
          closeSync(logFd)
          closeSync(errorFd)
          child.on('error', () => {})
          item = { child, hash }
          children.set(backend.id, item)
        }
        backendStates.push({
          id: backend.id,
          name: backend.name,
          pid: item.child.pid,
          running: item.child.exitCode === null,
          mappings: rendered.mappings.map(mapping => ({
            label: mapping.resolvedLabel,
            localIP: mapping.localIP,
            localPort: mapping.localPort,
            source: mapping.source,
            url: mappingUrl(backend, mapping),
          })),
        })
      }
    }

    for (const [id, item] of children) {
      if (!desiredIds.has(id)) {
        await stopChild(item)
        children.delete(id)
      }
    }

    writeJson(targetPaths.statusPath, {
      backends: backendStates,
      errors,
      pid: process.pid,
      updatedAt: new Date().toISOString(),
    })
    if (once)
      break
    await new Promise(resolvePromise => setTimeout(resolvePromise, 2000))
  }
  await stopAll()
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export async function main(argv = process.argv.slice(2), home = homedir()) {
  const args = parseArgs(argv)
  const command = args._[0] || 'status'
  if (command === 'install')
    return install(home)
  if (command === 'status')
    return status(home, Boolean(args.json))
  if (command === 'restart')
    return restart()
  if (command === 'uninstall')
    return uninstall(home)
  if (command === 'menubar') {
    const subcommand = args._[1]
    if (subcommand === 'install')
      return installMenuBar(home)
    if (subcommand === 'uninstall')
      return uninstallMenuBar(home)
    throw new Error('Usage: ark-tunnels menubar install | uninstall')
  }
  if (command === 'agent')
    return runAgent(home, Boolean(args.once))
  throw new Error('Usage: ark-tunnels install | status [--json] | restart | uninstall | menubar install | uninstall')
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
