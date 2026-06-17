import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { resolveArkDataPath } from './env'
import { resolveAppSecret } from './secret'

type ArkStorageDriver = 'local' | 's3'

interface ArkBaseStorageLocation {
  bucket: string
  driver: ArkStorageDriver
  name: string
  publicUrl?: string
  signedUrlExpiresSeconds: number
}

export interface ArkLocalStorageLocation extends ArkBaseStorageLocation {
  driver: 'local'
  root: string
}

export interface ArkS3StorageLocation extends ArkBaseStorageLocation {
  driver: 's3'
  endpoint?: string
  forcePathStyle: boolean
  key: string
  region: string
  secret: string
}

export type ArkStorageLocation = ArkLocalStorageLocation | ArkS3StorageLocation

export interface ArkStorageConfig {
  autoCreateBuckets: boolean
  defaultPrivateLocation: string
  defaultPublicLocation: string
  locations: Record<string, ArkStorageLocation>
}

interface StoredObjectRef {
  bucket: string
  path: string
  storage: string
}

interface SignedFileUrlInput {
  disposition?: string | null
  expires?: number
  id: string
  variant?: string | null
}

interface VerifySignedFileUrlInput {
  disposition?: string | null
  expires: string | number | undefined
  id: string
  signature: string | undefined
  variant?: string | null
  version?: string | number | undefined
}

function envKey(location: string, suffix: string) {
  return `STORAGE_${location.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${suffix}`
}

function boolValue(value: string | undefined, fallback = false) {
  if (value == null || value === '')
    return fallback

  return /^(?:1|true|yes)$/i.test(value)
}

function intValue(value: string | undefined, fallback: number) {
  if (!value)
    return fallback

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function required(value: string | undefined, key: string) {
  if (!value)
    throw new Error(`${key} is required for Ark S3 storage.`)

  return value
}

function parseLocations(value: string | undefined) {
  return (value ?? 'local')
    .split(',')
    .map(location => location.trim().toLowerCase())
    .filter(Boolean)
}

function storageDriver(name: string, env: NodeJS.ProcessEnv) {
  return (env[envKey(name, 'DRIVER')] ?? (name === 'local' ? 'local' : 's3')).toLowerCase()
}

export function parseStorageConfig(env: NodeJS.ProcessEnv = process.env): ArkStorageConfig {
  const locationNames = parseLocations(env.STORAGE_LOCATIONS)
  if (!locationNames.length)
    throw new Error('STORAGE_LOCATIONS must include at least one storage location.')

  const locations: Record<string, ArkStorageLocation> = {}

  for (const name of locationNames) {
    const driverKey = envKey(name, 'DRIVER')
    const driver = storageDriver(name, env)
    if (driver !== 'local' && driver !== 's3')
      throw new Error(`${driverKey}=${driver} is not supported. Ark files support driver=local or driver=s3.`)

    const signedUrlExpiresSeconds = intValue(env[envKey(name, 'SIGNED_URL_EXPIRES')], 300)

    if (driver === 'local') {
      locations[name] = {
        bucket: env[envKey(name, 'BUCKET')] || name,
        driver,
        name,
        publicUrl: env[envKey(name, 'PUBLIC_URL')] || undefined,
        root: env[envKey(name, 'ROOT')] || resolveArkDataPath('uploads', env),
        signedUrlExpiresSeconds,
      }
      continue
    }

    const bucketKey = envKey(name, 'BUCKET')
    const keyKey = envKey(name, 'KEY')
    const secretKey = envKey(name, 'SECRET')

    locations[name] = {
      bucket: required(env[bucketKey], bucketKey),
      driver: 's3',
      endpoint: env[envKey(name, 'ENDPOINT')] || undefined,
      forcePathStyle: boolValue(env[envKey(name, 'FORCE_PATH_STYLE')], true),
      key: required(env[keyKey], keyKey),
      name,
      publicUrl: env[envKey(name, 'PUBLIC_URL')] || undefined,
      region: env[envKey(name, 'REGION')] || 'auto',
      secret: required(env[secretKey], secretKey),
      signedUrlExpiresSeconds,
    }
  }

  const defaultPrivateLocation = (env.STORAGE_PRIVATE_LOCATION || env.STORAGE_DEFAULT_LOCATION || locationNames[0]!).toLowerCase()
  const defaultPublicLocation = (env.STORAGE_PUBLIC_LOCATION || (locations.public ? 'public' : defaultPrivateLocation)).toLowerCase()

  if (!locations[defaultPrivateLocation])
    throw new Error(`Default private storage location "${defaultPrivateLocation}" is not listed in STORAGE_LOCATIONS.`)

  if (!locations[defaultPublicLocation])
    throw new Error(`Default public storage location "${defaultPublicLocation}" is not listed in STORAGE_LOCATIONS.`)

  return {
    autoCreateBuckets: boolValue(env.STORAGE_AUTO_CREATE_BUCKETS, false),
    defaultPrivateLocation,
    defaultPublicLocation,
    locations,
  }
}

let cachedConfig: ArkStorageConfig | null = null
const clientCache = new Map<string, S3Client>()
const ensuredBuckets = new Set<string>()

export function getStorageConfig() {
  cachedConfig ??= parseStorageConfig()
  return cachedConfig
}

export function resetStorageConfigForTests() {
  cachedConfig = null
  clientCache.clear()
  ensuredBuckets.clear()
}

export function resolveStorageLocation(name: string) {
  const config = getStorageConfig()
  const location = config.locations[name]
  if (!location)
    throw new Error(`Unknown Ark storage location "${name}".`)

  return location
}

export function defaultPrivateStorage() {
  return resolveStorageLocation(getStorageConfig().defaultPrivateLocation)
}

export function defaultPublicStorage() {
  return resolveStorageLocation(getStorageConfig().defaultPublicLocation)
}

function s3Client(location: ArkStorageLocation) {
  if (location.driver !== 's3')
    throw new Error(`Storage location "${location.name}" is not an S3 location.`)

  const cached = clientCache.get(location.name)
  if (cached)
    return cached

  const client = new S3Client({
    credentials: {
      accessKeyId: location.key,
      secretAccessKey: location.secret,
    },
    endpoint: location.endpoint,
    forcePathStyle: location.forcePathStyle,
    region: location.region,
  })
  clientCache.set(location.name, client)
  return client
}

async function ensureBucket(location: ArkStorageLocation) {
  if (location.driver !== 's3')
    return

  const config = getStorageConfig()
  if (!config.autoCreateBuckets)
    return

  const key = `${location.name}:${location.bucket}`
  if (ensuredBuckets.has(key))
    return

  const client = s3Client(location)
  try {
    await client.send(new HeadBucketCommand({ Bucket: location.bucket }))
  }
  catch {
    await client.send(new CreateBucketCommand({ Bucket: location.bucket }))
  }
  ensuredBuckets.add(key)
}

function localObjectPath(location: ArkLocalStorageLocation, path: string) {
  if (isAbsolute(path))
    throw new Error(`Local storage path must be relative: ${path}`)

  const root = resolve(location.root)
  const target = resolve(root, path)
  const relativeTarget = relative(root, target)
  if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget))
    throw new Error(`Local storage path escapes root: ${path}`)

  return target
}

export async function putStoredObject(location: ArkStorageLocation, path: string, body: Buffer, contentType: string) {
  if (location.driver === 'local') {
    const target = localObjectPath(location, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body)
    return
  }

  await ensureBucket(location)
  await s3Client(location).send(new PutObjectCommand({
    Body: body,
    Bucket: location.bucket,
    ContentLength: body.length,
    ContentType: contentType,
    Key: path,
  }))
}

export async function readStoredObject(ref: StoredObjectRef) {
  const location = resolveStorageLocation(ref.storage)
  if (location.driver === 'local')
    return createReadStream(localObjectPath(location, ref.path))

  const result = await s3Client(location).send(new GetObjectCommand({
    Bucket: ref.bucket,
    Key: ref.path,
  }))

  if (!result.Body)
    throw new Error(`Object ${ref.bucket}/${ref.path} did not return a body.`)

  const body = result.Body as any
  if (typeof body.pipe === 'function')
    return body as Readable

  if (typeof body.transformToWebStream === 'function')
    return Readable.fromWeb(body.transformToWebStream())

  throw new Error(`Object ${ref.bucket}/${ref.path} did not return a readable stream.`)
}

export async function signedReadUrl(ref: StoredObjectRef) {
  const location = resolveStorageLocation(ref.storage)
  if (location.driver === 'local')
    throw new Error('Local storage signed URLs must be created with buildSignedFileUrl().')

  return getSignedUrl(
    s3Client(location),
    new GetObjectCommand({
      Bucket: ref.bucket,
      Key: ref.path,
    }),
    { expiresIn: location.signedUrlExpiresSeconds },
  )
}

export function publicObjectUrl(ref: StoredObjectRef) {
  const location = resolveStorageLocation(ref.storage)
  if (!location.publicUrl)
    return null

  return `${location.publicUrl.replace(/\/+$/, '')}/${ref.path.split('/').map(encodeURIComponent).join('/')}`
}

function canonicalSignedFilePayload(input: Required<SignedFileUrlInput> & { version: string }) {
  return [
    `v=${input.version}`,
    `id=${input.id}`,
    `variant=${input.variant ?? ''}`,
    `expires=${input.expires}`,
    `disposition=${input.disposition ?? ''}`,
  ].join('\n')
}

function signPayload(payload: string, env: NodeJS.ProcessEnv = process.env) {
  return createHmac('sha256', resolveAppSecret(env)).update(payload).digest('base64url')
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function buildSignedFileUrl(input: SignedFileUrlInput, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  const expires = input.expires ?? Math.floor(now / 1000) + intValue(env.FILES_SIGNED_URL_EXPIRES, 300)
  const version = '1'
  const payload = canonicalSignedFilePayload({
    disposition: input.disposition ?? '',
    expires,
    id: input.id,
    variant: input.variant ?? '',
    version,
  })
  const params = new URLSearchParams({
    expires: String(expires),
    sig: signPayload(payload, env),
    v: version,
  })

  if (input.variant)
    params.set('variant', input.variant)
  if (input.disposition)
    params.set('disposition', input.disposition)

  const baseUrl = env.FILES_PUBLIC_URL || env.BETTER_AUTH_URL || ''
  return `${baseUrl.replace(/\/+$/, '')}/api/ark/files/${encodeURIComponent(input.id)}?${params.toString()}`
}

export function verifySignedFileUrl(input: VerifySignedFileUrlInput, env: NodeJS.ProcessEnv = process.env, now = Date.now()) {
  if (!input.signature || String(input.version ?? '1') !== '1')
    return false

  const expires = typeof input.expires === 'number' ? input.expires : Number.parseInt(input.expires ?? '', 10)
  if (!Number.isFinite(expires) || expires <= 0 || now > expires * 1000)
    return false

  const payload = canonicalSignedFilePayload({
    disposition: input.disposition ?? '',
    expires,
    id: input.id,
    variant: input.variant ?? '',
    version: '1',
  })

  return constantTimeEqual(signPayload(payload, env), input.signature)
}
