#!/usr/bin/env node
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import postgres from 'postgres'

const cellIdPattern = /^p([1-9]\d{0,4})-([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/

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

export function parsePort(value, fallback) {
  const raw = value ?? fallback
  const port = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`Invalid development port: ${raw ?? '<missing>'}`)
  return port
}

export function parsePortRange(value) {
  const match = String(value ?? '').trim().match(/^([1-9]\d{0,4})-([1-9]\d{0,4})$/)
  if (!match)
    throw new Error('ARK_DEV_PORT_RANGE must look like 3100-3199.')
  const from = parsePort(match[1])
  const to = parsePort(match[2])
  if (from > to)
    throw new Error('ARK_DEV_PORT_RANGE start must not exceed its end.')
  return [from, to]
}

export function resolveCell(env, portValue) {
  const slot = required(env, 'ARK_DEV_SLOT').toLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slot))
    throw new Error('ARK_DEV_SLOT must be one lowercase DNS-safe label.')

  const port = parsePort(portValue, env.PORT)
  const [from, to] = parsePortRange(required(env, 'ARK_DEV_PORT_RANGE'))
  if (port < from || port > to)
    throw new Error(`Port ${port} is outside ARK_DEV_PORT_RANGE=${from}-${to}.`)

  const baseUrl = parseBaseUrl(required(env, 'ARK_DEV_BASE_URL'))
  const id = `p${port}-${slot}`
  if (!cellIdPattern.test(id) || id.length > 63)
    throw new Error(`Resolved Cell ID is not a valid DNS label: ${id}`)

  const publicUrl = new URL(baseUrl)
  publicUrl.hostname = `${id}.${baseUrl.hostname}`
  publicUrl.pathname = ''
  publicUrl.search = ''
  publicUrl.hash = ''

  return {
    baseUrl: baseUrl.origin,
    id,
    port,
    portRange: [from, to],
    publicUrl: publicUrl.origin,
    slot,
  }
}

export function parseList(value) {
  return [...new Set(String(value ?? '').split(',').map(item => item.trim()).filter(Boolean))]
}

export function resolveMeiliIndexes(env, cell) {
  return parseList(env.ARK_DEV_MEILISEARCH_INDEXES).map((envName) => {
    if (!/^[A-Z][A-Z0-9_]*$/.test(envName))
      throw new Error(`Invalid Meilisearch index env name: ${envName}`)
    const suffix = required(env, envName)
    if (!/^[a-zA-Z0-9_-]+$/.test(suffix))
      throw new Error(`${envName} must contain only letters, numbers, hyphens, or underscores.`)
    const uid = `${cell.id}-${suffix}`
    if (uid.length > 400)
      throw new Error(`Meilisearch index UID is too long: ${uid}`)
    return { envName, suffix, uid }
  })
}

export function resolveStorageLocations(env, cell) {
  return parseList(required(env, 'ARK_DEV_STORAGE_LOCATIONS')).map((name) => {
    const normalized = name.toLowerCase()
    if (!/^[a-z][a-z0-9_]*$/.test(normalized))
      throw new Error(`Invalid storage location: ${name}`)
    const prefix = `STORAGE_${normalized.toUpperCase()}`
    const driver = required(env, `${prefix}_DRIVER`).toLowerCase()
    if (driver !== 's3')
      throw new Error(`${prefix}_DRIVER must be s3 for Ark remote development.`)
    const bucket = `${cell.id}-${normalized.replaceAll('_', '-')}`
    if (bucket.length > 63)
      throw new Error(`S3 bucket name is too long: ${bucket}`)
    return {
      bucket,
      envPrefix: prefix,
      forcePathStyle: (env[`${prefix}_FORCE_PATH_STYLE`] ?? 'true') !== 'false',
      key: required(env, `${prefix}_KEY`),
      name: normalized,
      endpoint: required(env, `${prefix}_ENDPOINT`),
      region: env[`${prefix}_REGION`] || 'auto',
      secret: required(env, `${prefix}_SECRET`),
    }
  })
}

export function buildRuntimeOverlay(env, cell, indexes, locations) {
  const localOrigins = [
    `http://localhost:${cell.port}`,
    `http://127.0.0.1:${cell.port}`,
  ]
  const trustedOrigins = [...new Set([
    cell.publicUrl,
    ...localOrigins,
    ...String(env.BETTER_AUTH_TRUSTED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean),
  ])]
  const overlay = {
    PORT: String(cell.port),
    BETTER_AUTH_URL: cell.publicUrl,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins.join(','),
    FILES_PUBLIC_URL: cell.publicUrl,
    NUXT_PUBLIC_SITE_URL: cell.publicUrl,
    STORAGE_AUTO_CREATE_BUCKETS: 'true',
    VITE_ALLOWED_HOSTS: new URL(cell.publicUrl).hostname,
    VITE_HMR_ORIGIN: cell.publicUrl,
  }
  for (const index of indexes)
    overlay[index.envName] = index.uid
  for (const location of locations) {
    overlay[`${location.envPrefix}_BUCKET`] = location.bucket
    overlay[`${location.envPrefix}_PUBLIC_URL`] = ''
  }
  return overlay
}

export function derivedDatabaseUrl(baseDatabaseUrl, cellId) {
  const url = new URL(required({ DATABASE_URL: baseDatabaseUrl }, 'DATABASE_URL'))
  url.pathname = `/${cellId}`
  return url.toString()
}

export function assertDestructiveCell(cell) {
  const match = cellIdPattern.exec(cell.id)
  if (!match || Number(match[1]) !== cell.port || match[2] !== cell.slot)
    throw new Error(`Refusing destructive operation for invalid Cell ID: ${cell.id}`)
  if (cell.port < cell.portRange[0] || cell.port > cell.portRange[1])
    throw new Error(`Refusing destructive operation outside configured port range: ${cell.port}`)
}

function parseBaseUrl(value) {
  let url
  try {
    url = new URL(value)
  }
  catch {
    throw new Error('ARK_DEV_BASE_URL must be an absolute HTTPS URL.')
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash)
    throw new Error('ARK_DEV_BASE_URL must be an HTTPS origin without a path, query, or hash.')
  return url
}

function required(env, name) {
  const value = env[name]?.trim()
  if (!value)
    throw new Error(`${name} is required for Ark remote development.`)
  return value
}

async function databaseExists(sql, name) {
  const rows = await sql`select 1 from pg_database where datname = ${name} limit 1`
  return rows.length > 0
}

async function ensureDatabase(baseUrl, cell) {
  const sql = postgres(baseUrl, { max: 1 })
  try {
    if (!await databaseExists(sql, cell.id))
      await sql.unsafe(`CREATE DATABASE "${cell.id}"`)
  }
  finally {
    await sql.end()
  }
}

async function destroyDatabase(baseUrl, cell) {
  assertDestructiveCell(cell)
  const sql = postgres(baseUrl, { max: 1 })
  try {
    await sql`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${cell.id} and pid <> pg_backend_pid()`
    await sql.unsafe(`DROP DATABASE IF EXISTS "${cell.id}"`)
  }
  finally {
    await sql.end()
  }
}

function storageClient(location) {
  return new S3Client({
    credentials: { accessKeyId: location.key, secretAccessKey: location.secret },
    endpoint: location.endpoint,
    forcePathStyle: location.forcePathStyle,
    region: location.region,
  })
}

async function bucketExists(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    return true
  }
  catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound' || error?.name === 'NoSuchBucket')
      return false
    throw error
  }
}

async function emptyBucket(client, bucket) {
  let keyMarker
  let versionIdMarker
  do {
    const page = await client.send(new ListObjectVersionsCommand({ Bucket: bucket, KeyMarker: keyMarker, VersionIdMarker: versionIdMarker }))
    const objects = [...(page.Versions || []), ...(page.DeleteMarkers || [])]
      .map(item => ({ Key: item.Key, VersionId: item.VersionId }))
      .filter(item => item.Key)
    if (objects.length)
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }))
    keyMarker = page.NextKeyMarker
    versionIdMarker = page.NextVersionIdMarker
    if (!page.IsTruncated)
      break
  } while (true)

  let continuationToken
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }))
    const objects = (page.Contents || []).map(item => ({ Key: item.Key })).filter(item => item.Key)
    if (objects.length)
      await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }))
    continuationToken = page.NextContinuationToken
  } while (continuationToken)
}

async function ensureBuckets(locations, cell) {
  const allowedOrigins = [cell.publicUrl, `http://localhost:${cell.port}`, `http://127.0.0.1:${cell.port}`]
  for (const location of locations) {
    const client = storageClient(location)
    if (!await bucketExists(client, location.bucket))
      await client.send(new CreateBucketCommand({ Bucket: location.bucket }))
    await client.send(new PutBucketCorsCommand({
      Bucket: location.bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST'],
          AllowedOrigins: allowedOrigins,
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }],
      },
    }))
  }
}

async function destroyBuckets(locations, cell) {
  assertDestructiveCell(cell)
  for (const location of locations) {
    const client = storageClient(location)
    if (!await bucketExists(client, location.bucket))
      continue
    await emptyBucket(client, location.bucket)
    await client.send(new DeleteBucketCommand({ Bucket: location.bucket }))
  }
}

function meiliHeaders(env) {
  const headers = { 'content-type': 'application/json' }
  if (env.MEILISEARCH_KEY)
    headers.authorization = `Bearer ${env.MEILISEARCH_KEY}`
  return headers
}

async function waitForMeiliTask(base, headers, response) {
  if (!response.ok)
    return
  const task = await response.json()
  if (!Number.isInteger(task.taskUid))
    return
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const statusResponse = await fetch(`${base}/tasks/${task.taskUid}`, { headers })
    if (!statusResponse.ok)
      throw new Error(`Could not inspect Meilisearch task ${task.taskUid}.`)
    const status = await statusResponse.json()
    if (status.status === 'succeeded')
      return
    if (status.status === 'failed' || status.status === 'canceled')
      throw new Error(`Meilisearch task ${task.taskUid} ${status.status}: ${status.error?.message || 'unknown error'}`)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
  }
  throw new Error(`Timed out waiting for Meilisearch task ${task.taskUid}.`)
}

export async function ensureMeiliIndexes(env, indexes) {
  if (!indexes.length)
    return
  const base = required(env, 'MEILISEARCH_URL').replace(/\/+$/, '')
  const headers = meiliHeaders(env)
  for (const index of indexes) {
    const current = await fetch(`${base}/indexes/${encodeURIComponent(index.uid)}`, { headers })
    if (current.ok)
      continue
    if (current.status !== 404)
      throw new Error(`Could not inspect Meilisearch index ${index.uid}: ${current.status} ${await current.text()}`)
    const response = await fetch(`${base}/indexes`, {
      body: JSON.stringify({ uid: index.uid }),
      headers,
      method: 'POST',
    })
    if (!response.ok && response.status !== 409)
      throw new Error(`Could not create Meilisearch index ${index.uid}: ${response.status} ${await response.text()}`)
    if (response.ok)
      await waitForMeiliTask(base, headers, response)
  }
}

async function destroyMeiliIndexes(env, indexes, cell) {
  assertDestructiveCell(cell)
  if (!indexes.length)
    return
  const base = required(env, 'MEILISEARCH_URL').replace(/\/+$/, '')
  const headers = meiliHeaders(env)
  for (const index of indexes) {
    const response = await fetch(`${base}/indexes/${encodeURIComponent(index.uid)}`, { headers, method: 'DELETE' })
    if (response.status === 404)
      continue
    if (!response.ok)
      throw new Error(`Could not delete Meilisearch index ${index.uid}: ${response.status} ${await response.text()}`)
    await waitForMeiliTask(base, headers, response)
  }
}

function printTargets(cell, indexes, locations) {
  console.log(`Ark Development Cell: ${cell.id}`)
  console.log(`  URL: ${cell.publicUrl}`)
  console.log(`  Postgres: ${cell.id}`)
  console.log(`  Meilisearch: ${indexes.length ? indexes.map(item => item.uid).join(', ') : '(none)'}`)
  console.log(`  S3: ${locations.map(item => item.bucket).join(', ')}`)
}

function forwardedArkArgs(argv) {
  const forwarded = []
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--' || value === 'dev' || value === 'destroy' || value === '--reset')
      continue
    if (value === '--port') {
      index += 1
      continue
    }
    if (value.startsWith('--port='))
      continue
    forwarded.push(value)
  }
  return forwarded
}

async function launchArk(env, cell, argv) {
  const child = spawn('pnpm', [
    'exec',
    'ark',
    'dev',
    '--port',
    String(cell.port),
    '--public-url',
    cell.publicUrl,
    ...forwardedArkArgs(argv),
  ], { env, stdio: 'inherit' })

  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => child.kill(signal))

  await new Promise((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`ark dev exited with code ${code ?? 1}`)))
  })
}

export async function main(argv = process.argv.slice(2), baseEnv = process.env) {
  loadDotenv({ path: resolve(process.cwd(), '.env'), override: false })
  const env = { ...baseEnv, ...process.env }
  if (env.NODE_ENV === 'production')
    throw new Error('ark-dev is development-only and refuses NODE_ENV=production.')

  const args = parseArgs(argv)
  const command = args._[0] || 'dev'
  if (!['dev', 'destroy'].includes(command))
    throw new Error('Usage: ark-dev [dev] --port <port> [--reset] | ark-dev destroy --port <port>')

  const cell = resolveCell(env, args.port)
  const indexes = resolveMeiliIndexes(env, cell)
  const locations = resolveStorageLocations(env, cell)
  const databaseBaseUrl = required(env, 'DATABASE_URL')
  printTargets(cell, indexes, locations)

  if (command === 'destroy' || args.reset) {
    assertDestructiveCell(cell)
    await destroyMeiliIndexes(env, indexes, cell)
    await destroyBuckets(locations, cell)
    await destroyDatabase(databaseBaseUrl, cell)
    console.log(`Destroyed ${cell.id}`)
    if (command === 'destroy')
      return
  }

  await ensureDatabase(databaseBaseUrl, cell)
  await ensureMeiliIndexes(env, indexes)
  await ensureBuckets(locations, cell)

  const overlay = buildRuntimeOverlay(env, cell, indexes, locations)
  overlay.DATABASE_URL = derivedDatabaseUrl(databaseBaseUrl, cell.id)
  await launchArk({ ...env, ...overlay }, cell, argv)
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
