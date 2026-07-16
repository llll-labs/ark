# @kurark/ark

Experimental alpha Ark runtime for tenant applications.

Ark is the technical runtime: package, database schema, API routes, composables, and table exports. Kurark is the public discovery/product surface for arks.

## Concepts

An ark is a complete mini app / tenant runtime, not a single Discord-server-like object. Spaces are the server/workspace/team/project boundaries inside that ark.

- `ark.users` are human, integration, or system actors.
- `ark.spaces` are collaboration and permission containers. `organization` is the neutral core kind for company/studio/team-like spaces.
- `ark.memberships`, `ark.roles`, and `ark.grants` define scoped access to spaces and their resources.
- `ark.channels` live inside spaces and cover chat, forums, DMs, threads, feeds, and job discussions.
- `ark.market_stores` are standing seller presences, one per space.

Marketplace primitives follow a single rule — **the actor is always a space**:

- a personal account is a space of `kind = organization` with one owner member; a studio/company is the same with more members
- `ark.market_stores.owner_space_id` ties a store 1:1 to its space (carrying rate, availability, verification, and rating)
- `ark.market_jobs.space_id` is the space that posted the buying act; `discussion_channel_id` links its job-discussion channel
- role is per-transaction: any space can both sell (a store) and buy (post jobs). There is no performer/customer entity and no per-user profile
- offers, orders, responses, and reviews are deferred to v2
- notification outbox stays in the Ark runtime; parser/importer state belongs to the tenant app migration because sources and parsing rules are app-specific

## Install

```bash
pnpm add @kurark/ark@alpha
```

Extend Ark from a Nuxt tenant app:

```ts
export default defineNuxtConfig({
  extends: ['@kurark/ark'],
})
```

## Runtime

Ark starts without infrastructure envs. By default it uses:

- Drizzle + PGlite at `.ark/<PORT>/database`
- local filesystem uploads at `.ark/<PORT>/uploads`
- in-process Nitro cache

In this workspace the default root is port-scoped, so `PORT=5400` maps to `.ark/5400/database` and `.ark/5400/uploads`. Set `PORT=5412` to run a second isolated local ark. Explicit `DB_DATA_DIR` and `STORAGE_LOCAL_ROOT` still win.

For local development, use the Ark CLI from a tenant app or this repo:

```bash
ark dev --port 5412
ark status
ark kill --dry-run
ark worktree create auth-flow --branch codex/auth-flow --port 5412
```

A worktree is the code namespace. `PORT` is the runtime and network identity.
`.ark/<PORT>` is the worktree-local port cell for database and uploads. Public
tunnels are consumer-specific and are not part of Ark core.

Set `DATABASE_URL` to use external Postgres. Set `STORAGE_LOCATIONS` and `STORAGE_<LOCATION>_*` envs to use named storage locations. The storage env shape mirrors Directus-style driver configuration:

```env
STORAGE_LOCATIONS=local
STORAGE_LOCAL_DRIVER=local
STORAGE_LOCAL_ROOT=.ark/5400/uploads
```

For S3-compatible storage:

```env
STORAGE_LOCATIONS=private,public
STORAGE_PRIVATE_DRIVER=s3
STORAGE_PRIVATE_BUCKET=ark-files-private
STORAGE_PRIVATE_ENDPOINT=http://localhost:5402
STORAGE_PRIVATE_KEY=rustfsadmin
STORAGE_PRIVATE_SECRET=rustfsadmin
```

Local private-file signed URLs are app HMAC URLs signed with `BETTER_AUTH_SECRET`.

### Direct S3 uploads and protected delivery

S3-backed tenants can upload without buffering file bytes in Nitro:

```text
POST   /api/ark/files/uploads
POST   /api/ark/files/uploads/:uploadId/finalize
DELETE /api/ark/files/uploads/:uploadId
```

Creation accepts `spaceId`, `originalFilename`, `mimeType`, `sizeBytes`, an
optional named `storage`, tenant `metadataJson`, and
`accessMode: "space" | "signed_only"`. It returns
a short-lived single-PUT URL and required headers. The storage CORS policy must
allow `Content-Type` and `If-None-Match`; the browser supplies the signed
`Content-Length` from the request body. The create-only condition prevents a
still-valid URL from overwriting its object after finalization. Finalization verifies object
size, MIME type, ownership, expiry, and ETag before creating the `ark.files`
row. `FILES_DIRECT_UPLOAD_MAX_BYTES` defaults to 5 GB and
`FILES_UPLOAD_URL_EXPIRES` defaults to 15 minutes.

`signed_only` files cannot be opened through broad space-level `files.read`;
trusted tenant domain code must authorize its own entitlement and then call
`createTrustedArkFileDeliveryUrl()` from `@kurark/ark/server/utils/files`.
That function performs no authorization itself. S3 files receive direct,
short-lived object-store URLs; local files receive Ark HMAC URLs.

`createArkPublicImageDerivative()` creates a separate sanitized public WebP
plus preview/thumb variants from a private JPEG, PNG, or WebP source up to
25 MB. Upload sessions remain Ark Internal Tables rather than Resources; these
binary operations are specialized Files domain operations and can later route
their metadata writes through the `ark.files` Code Resource lifecycle.
Call `cleanupExpiredArkFileUploads()` from a durable tenant/worker schedule to
remove abandoned objects after their PUT URLs expire; failed deletions remain
pending for a later retry.

`deleteTrustedArkFileObject()` is the tenant-trusted cleanup primitive for
terminal domain records. It performs no authorization, refuses public files
unless explicitly allowed, optionally pins the expected storage location,
deletes the object, and then soft-deletes its `ark.files` row.

Run the Drizzle migrations shipped with the package before booting a tenant app that uses Ark. The migrations create the Ark runtime schema, including auth, users, spaces, roles, capabilities, content, channels, files, market stores and jobs, notification outbox, and settings. Tenant apps should run their own migration chain after the core chain for tenant-owned physical tables.

## Resource API

Ark exposes registered physical tables through a Directus-style REST surface:

```text
GET    /api/ark/items/:resource
GET    /api/ark/items/:resource/:id
POST   /api/ark/items/:resource
PATCH  /api/ark/items/:resource/:id
DELETE /api/ark/items/:resource/:id
```

Tenant code registers its migration-owned physical tables from a Nitro plugin:

```ts
import { registerArkResource } from '@kurark/ark/server/resources'
import { jobs } from '../db/schema'

export default defineNitroPlugin(() => {
  registerArkResource({
    name: 'jobs',
    table: jobs,
    deletion: 'soft',
    operations: { create: true, delete: true, read: true, update: true },
    rowPolicy: {
      read: accountability => ({ spaceId: { _eq: accountability.spaceId } }),
      create: accountability => ({ spaceId: { _eq: accountability.spaceId } }),
      update: accountability => ({ spaceId: { _eq: accountability.spaceId } }),
      delete: accountability => ({ spaceId: { _eq: accountability.spaceId } }),
    },
  })
})
```

Adoption registers closed-by-default permissions such as `jobs.items.read` and
`jobs.items.create`; an administrator must grant them through Ark permissions.
Code-owned Resources use `registerArkResource()` and opt into every generic
operation explicitly. Only Ark code-owned Resources may use the `ark.*` prefix.
Core aggregate roots are registered with generic CRUD disabled: `ark.channels`,
`ark.files`, `ark.market_jobs`, `ark.market_stores`, `ark.messages`, `ark.pages`,
`ark.spaces`, and `ark.users`. Specialized Domain Actions enforce their own
permissions and invariants, then write through the Resource lifecycle and emit
targeted events such as `ark.messages.items.create` or
`ark.market_jobs.items.update`. Supporting join, state, auth, and outbox tables
remain internal implementation details rather than independent Resources.
Requests act as the public space by default. A client acting for another space
passes its id in `X-Ark-Space-Id`; Resource permissions and Row Policies are
then evaluated with that space as the actor.

Tenant-owned Nitro endpoints reuse the same request accountability and Resource
policies instead of rebuilding auth context:

```ts
import { useArkResourceService } from '@kurark/ark/server/resources'

export default defineEventHandler(async (event) => {
  const jobs = await useArkResourceService(event, 'jobs')
  return { data: await jobs.create(await readBody(event)) }
})
```

For endpoints composing several Resources, call
`createArkResourceRequestScope(event)` once and use
`scope.services.resource('jobs')`. Accountability distinguishes the Better Auth
principal (`userId`) from the provisioned Ark profile (`arkUserId`); `spaceId`
is the active domain actor.

List queries support `limit`, `offset`, `sort`, `fields`, JSON `filter`, and
Directus-style bracket filters such as
`filter[status][_eq]=open`. Generic mutations operate on one item and accept
scalar foreign keys only; bulk and deep relational writes are intentionally not
part of v1. Dot-selected fields explicitly expand configured relations through
the target Resource's normal read permissions and policies. The live REST
contract is available as OpenAPI at `/api/ark/openapi`.

Resource hooks use targeted event names and the Directus callback shape:

```ts
import { arkResourceHooks } from '@kurark/ark/server/resources'

arkResourceHooks.filter('jobs.items.create', (payload, meta, context) => payload)
arkResourceHooks.action('jobs.items.create', async (meta, context) => {
  // Required by default: awaited inside the Resource transaction. Services
  // created here inherit its accountability and transaction.
  await context.services.resource('job_audits').create({ jobId: meta.key })
})
arkResourceHooks.action('jobs.items.create', async (meta, context) => {
  // Dispatched asynchronously after commit; failures are logged.
}, { bestEffort: true })
```

Ark discovers tenant-owned `public` tables without exposing them automatically.
Administrators explicitly adopt eligible tables from Settings → Content →
Resources; adoption metadata persists in `ark.resource_definitions`. Code
registration remains authoritative over compatible adopted metadata.

## Auth And Middleware

Ark owns the default route guards in `app/middleware`:

- Telegram Mini App auto-auth
- authenticated-route redirect to `/login?redirect=...`
- onboarding redirect when onboarding is required or blocked

The client auth state comes from `useArkAuth()`, which checks `ark.me` and stores the result in Nuxt state.

## Status

This package is pre-v0 alpha. Source may still move between a tenant app and Ark while the public API settles.
