# Agent Notes — `@kurark/ark`

This is the reusable **Ark** runtime: a Nuxt 4 extension a tenant app `extends`. It owns
the `ark.*` schema, auth bridge, tRPC core router, storage, realtime, and
the core UI. It must stay **tenant-agnostic** — no tenant-specific literals, no
tenant locale/theme/slug baked in (see `CONTRIBUTING.md`).

## Runtime Defaults

- Ark does not require Docker, Postgres, or RustFS for feature work.
- With no infra env, it boots the embedded local runtime:
  - app port: `PORT`, default `5400`
  - database: Drizzle + PGlite at `.ark/<PORT>/database`
  - uploads: local filesystem at `.ark/<PORT>/uploads`
  - cache: in-process Nitro memory
- Worktrees are code namespaces. `PORT` is the runtime/network identity, and
  `.ark/<PORT>` is the worktree-local port cell for database and uploads.
- Use `ark dev --port <port>`, `ark status`, `ark kill --dry-run`, and
  `ark worktree create <slug> --branch <branch> --port <port>` for generic local
  developer operations.
- Explicit env always wins: `DATABASE_URL` selects Postgres, `DB_DATA_DIR`
  overrides the PGlite path, `STORAGE_LOCAL_ROOT` overrides the upload path.
- The reference `docker-compose.yml` (this dir) is the heavier opt-in profile;
  it is neutral (`ark`-prefixed, env-overridable), shipped for consumers to copy.
- FRP/dev tunnels are consumer-specific and must stay out of Ark core.
- **Boot guard**: `server/plugins/ark-preflight.ts` validates env at startup via
  `server/utils/preflight.mjs`. Contradictory/partial config (e.g. an s3 storage
  location missing its bucket) aborts boot in *any* mode; production-hardening
  gaps (weak secret, local storage, non-HTTPS origin) abort only when
  `NODE_ENV=production`, else warn. Zero-env local dev stays clean. The same
  validator backs `ark preflight` for CI/pre-deploy. Tenant apps add
  their own checks in their own server plugin — keep tenant policy (provider
  endpoints, AI keys, tenant secret literals) out of the core validator.

## Core/App Schema Boundary

- Core tables live in the `ark` schema without redundant `ark_` table prefixes, owned by `db/schema.ts` +
  `drizzle/*`. Core migrations must never create or mutate tenant `public.*`
  tables.
- A tenant app owns default `public` schema tables without `app_` prefixes and its own migration
  chain/journal. Migration order is **core first, app second**; app tables may FK
  stable core tables after core has created them.
- Use `uuidv7()` as the UUID PK default in both schemas. The initial core
  migration owns the `public.uuidv7()` helper (hand-prepended — drizzle-kit won't
  generate it; keep it at the top of `0000` on any regen).
- Core code must **not** import tenant tables. If core needs hydrated tenant
  data, expose an optional loader/extension hook (`server/utils/app-extensions`,
  `server/utils/app-settings`) and let the app register the join.
- Capabilities: `arkCapabilityValues` lists **core** capabilities only — never
  add tenant-domain actions to it. Tenant apps register their own at boot via
  `registerArkCapabilities(caps, { defaultRoles })` from a Nitro plugin; grant
  actions are stored as plain text, so no migration is needed. Capability-check
  helpers accept `ArkCapabilityLike` (core union + registered strings).
- `ark.collections` / `ark.fields` / `ark.items` are for non-technical
  user-built content, not for tenant app code that needs stable physical tables.

## Market Model & Actors

- The market actor is always a **space**, never the raw user. Personal account =
  a space `kind='organization'` with one owner member; company = same, more
  members. `ensureArkUser` auto-creates the personal space + `owner` membership
  on first authenticated request. Don't reintroduce user-as-actor.
- Selling is a **standing presence**: `ark.market_stores` (the store/витрина),
  1:1 per space (`owner_space_id` NOT NULL, partial-unique while not deleted),
  seller fields inline (rate, service summary, verification). No per-user store,
  no `type` discriminator.
- Buying is an **act**: a space posts `ark.market_jobs` (buyer = `space_id`) or
  contacts a store. No customer entity; rating lives on the space.
- Role is per-transaction: any space can both post jobs and sell. Onboarding
  routes by intent (sell/hire/browse) in the UI only — no role/type field.
- v2 (deferred, see `ROADMAP.md`): `ark.market_offers/orders/responses/reviews`;
  paid responses/commissions/PRO bill the space, not the user.

## Message Model

- Do not add `parentMessageId`/`parent_message_id`; removed pre-v0.
- Chat/DM/thread replies are flat messages + an `ark.message_relations` row
  (`relation_type=reply_quote`, `target_type=message`).
- Forum deep replies use `relation_type=forum_parent` plus
  `ark.messages.root_message_id` for tree grouping.
- Threads are real `ark.channels.kind=thread` channels owned by
  `thread_parent_channel_id` / `thread_root_message_id`; keep them out of normal
  channel nav and derive access from the parent channel.

## UI / Nuxt UI

- Never give a `USelect`/`USelectMenu` item an empty-string `value`. reka-ui
  reserves `''` for the cleared state and throws on every render; inside a modal
  this is an unbounded error storm. Use `placeholder`, or a non-empty sentinel
  (e.g. `'none'`) mapped back to `null` on submit.
- Style with @nuxt/ui semantic tokens (`bg-default`/`bg-muted`/`bg-elevated`/
  `bg-accented`, `text-default`/`text-toned`/`text-muted`/`text-highlighted`,
  `border-default`, `primary`/`success`/`error`). The neutral ramp is remapped in
  `app/assets/css/core.css`. Avoid hardcoded hex.
- Ark components auto-import by **bare filename** (`components: [{ pathPrefix:
  false }]`), so they group into feature folders without renaming. `<ArkShell>`,
  `<ArkLogo>` work; explicit `components/core/*` imports also keep working.
- i18n is `@nuxtjs/i18n` configured here. Ark ships neutral default locale
  `en` (with `ru` available); tenants override `i18n.defaultLocale`.
  `strategy: 'no_prefix'`, lazy JSON at `i18n/locales/`. `@nuxtjs/i18n`
  deep-merges Ark + tenant app locale files per code — use `$t`/`useI18n().t` for
  user-facing strings.
- Auth sign-out must POST `/api/auth/sign-out` with `Content-Type:
  application/json` and a JSON body (Better Auth returns 415 otherwise); prefer
  the Better Auth client `signOut()`.
