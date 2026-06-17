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

Run the Drizzle migrations shipped with the package before booting a tenant app that uses Ark. The migrations create the Ark runtime schema, including auth, users, spaces, roles, capabilities, content, channels, files, market stores and jobs, notification outbox, and settings. Tenant apps should run their own migration chain after the core chain for tenant-owned physical tables.

## Auth And Middleware

Ark owns the default route guards in `app/middleware`:

- Telegram Mini App auto-auth
- authenticated-route redirect to `/login?redirect=...`
- onboarding redirect when onboarding is required or blocked

The client auth state comes from `useArkAuth()`, which checks `ark.me` and stores the result in Nuxt state.

## Status

This package is pre-v0 alpha. Source may still move between a tenant app and Ark while the public API settles.
