# Remote Development Cells

> Status: implemented in Ark and adopted by the initial tenant repositories. Live provisioning still requires each developer's stage credentials in the tenant `.env`.

Ark tenant apps use remote Postgres, Meilisearch, and S3-compatible storage for local development. This document defines one development contract without adding tenant literals or provider policy to the Ark runtime.

## Ownership

| Owner | Responsibility |
| --- | --- |
| Studio | Infrastructure, provider credentials, domains, Coolify instances, and shared stage services |
| Tenant App | Port range, local environment, logical storage locations, logical search indexes, migrations, Bootstrap Data, Fixtures, and stage/production resources |
| `ark-dev` | Development Cell naming, remote provisioning, reset/destroy safety, runtime env overlay, and launching `ark dev` |
| Ark runtime | Generic Nuxt runtime, migrations, auth, storage, and app startup hooks |
| `ark-tunnels` | Local listener discovery, `frpc` supervision, and flat port-to-domain exposure |
| Tunnel infrastructure | Generic remote `frps`, wildcard DNS, and TLS routing |
| Coolify | Stage deployment from `dev` and production deployment from `main` |

A Studio is the infrastructure and credential boundary. A Tenant App always owns its data and deployment lifecycle even when several apps use services operated by the same Studio.

## Local environment contract

The tenant `.env` remains a complete runtime configuration. It may point directly at fixed resources and include Better Auth URLs, bucket names, and index names. `ark-dev` loads that file as a base and overrides Development Cell values only in the child process; it never rewrites `.env`.

Development policy uses the `ARK_DEV_*` namespace:

```env
ARK_DEV_SLOT=example-app-alice
ARK_DEV_BASE_URL=https://dev.example.com
ARK_DEV_PORT_RANGE=3100-3199
ARK_DEV_STORAGE_LOCATIONS=public,private,quarantine
ARK_DEV_MEILISEARCH_INDEXES=MEILISEARCH_ASSETS_INDEX
```

Runtime values and credentials keep their existing names:

```env
PORT=3150
DATABASE_URL=postgres://user:password@stage-postgres.example/stage_app

MEILISEARCH_URL=https://meili.stage.example
MEILISEARCH_KEY=replace-me
MEILISEARCH_ASSETS_INDEX=assets

STORAGE_LOCATIONS=public,private,quarantine
STORAGE_PRIVATE_DRIVER=s3
STORAGE_PRIVATE_ENDPOINT=https://s3.stage.example
STORAGE_PRIVATE_KEY=replace-me
STORAGE_PRIVATE_SECRET=replace-me
STORAGE_PRIVATE_BUCKET=stage-private
```

`ARK_DEV_MEILISEARCH_INDEXES` is a comma-separated list of runtime env variable names. The base value of each named variable is its logical index suffix. For example, `MEILISEARCH_ASSETS_INDEX=assets` becomes `<CELL_ID>-assets` inside a Development Cell.

`ARK_DEV_STORAGE_LOCATIONS` is a comma-separated list of logical locations that receive isolated physical buckets. Each listed location must have complete S3 runtime configuration in the base env.

## Identity and naming

A Development Slot belongs to one developer and one Tenant App. It must be distinct across that developer's projects and must equal the `slug` of the corresponding local Horse backend entry.

The selected port must fall within `ARK_DEV_PORT_RANGE`. The canonical Cell ID is:

```text
p<PORT>-<ARK_DEV_SLOT>
```

For `PORT=3150` and `ARK_DEV_SLOT=example-app-alice`:

```text
Cell ID:       p3150-example-app-alice
Postgres:      p3150-example-app-alice
Meilisearch:   p3150-example-app-alice-assets
S3 public:     p3150-example-app-alice-public
S3 private:    p3150-example-app-alice-private
S3 quarantine: p3150-example-app-alice-quarantine
Public URL:    https://p3150-example-app-alice.dev.example.com
```

The exact hyphenated Cell ID is reused across providers. PostgreSQL database creation must quote the identifier rather than translating it to a second underscore-based name.

## Starting a Cell

The human development surface stays small:

```sh
pnpm dev --port 3150
pnpm check
```

The tenant's `dev` script invokes the `ark-dev` binary shipped from `scripts/ark-dev.mjs` in the Ark package. On normal start it:

1. Loads the tenant `.env`.
2. Resolves `PORT`, validates it against `ARK_DEV_PORT_RANGE`, and derives the Cell ID.
3. Validates remote Postgres, Meilisearch, and S3 credentials.
4. Creates any missing Cell database, indexes, and physical buckets without changing existing Cell data.
5. Applies development CORS to every Cell bucket.
6. Builds an in-memory runtime overlay.
7. Launches `ark dev` with the selected port and derived public URL.

Remote providers are mandatory for this tenant workflow. Missing credentials or unavailable providers fail startup; there is no embedded Postgres, local storage, or local search fallback in `ark-dev`.

Provisioning is idempotent. A partial failure can be retried safely.

## Runtime overlay

The child process receives derived overrides for:

- `PORT`
- `DATABASE_URL`
- every bucket variable named by `ARK_DEV_STORAGE_LOCATIONS`
- every Meilisearch index variable named by `ARK_DEV_MEILISEARCH_INDEXES`
- `BETTER_AUTH_URL`
- `BETTER_AUTH_TRUSTED_ORIGINS`
- `NUXT_PUBLIC_SITE_URL`
- `FILES_PUBLIC_URL`
- Vite/Nuxt allowed-host and HMR origin values used by `ark dev`

The derived public application URL is `https://<CELL_ID>.<ARK_DEV_BASE_URL host>`. Trusted origins include that URL plus `http://localhost:<PORT>` and `http://127.0.0.1:<PORT>`.

When a Cell bucket replaces a base bucket, `ark-dev` clears that location's fixed `STORAGE_<LOCATION>_PUBLIC_URL`. Ark then serves public objects through the Cell application's `/api/ark/files/...` route instead of accidentally resolving them against stage. Direct bucket/CDN URL templates can be added later if a real tenant requires them.

## Bucket CORS

Every created Cell bucket receives development CORS with:

- origins restricted to the Cell public URL and the two local origins for its port;
- methods `GET`, `HEAD`, `PUT`, and `POST`;
- all request headers allowed;
- `ETag` exposed.

Fixed stage buckets are never changed by `ark-dev`.

## Reset and destruction

Normal start preserves remote data. Destructive behavior is always explicit:

```sh
pnpm dev --port 3150 --reset
pnpm exec ark-dev destroy --port 3150
```

`--reset` recreates the exact Cell and then starts it. `destroy` removes the exact Cell database, indexes, and buckets without starting the app. Both operations print their fully resolved targets first and refuse any target that does not exactly match `p<PORT>-<ARK_DEV_SLOT>` for a port inside the configured range.

Cells have no automatic TTL or pruning. They persist until explicitly reset or destroyed.

## Bootstrap Data and Fixtures

Migrations run when Ark starts. Tenant startup plugins reconcile required Bootstrap Data idempotently in every environment.

Fixtures are tenant-owned and disabled by default. A tenant may respond to:

```env
ARK_DEV_FIXTURES=true
```

by loading idempotent development Fixtures from its own startup plugin. `ark-dev` contains no tenant fixture logic.

## Ark Tunnels integration

The Horse Tunnels client engine now ships in the Ark package as the `ark-tunnels` development binary. It remains independent of the Ark runtime and tenant domain concepts. Its local configuration contains opaque backend entries with a domain, non-overlapping auto-expose port range, and slug. `ark-dev` does not edit tunnel configuration or call tunnel commands.

The agreed tunnel naming contract is:

```text
backend.slug = ARK_DEV_SLOT
auto hostname = p<PORT>-<backend.slug>.<domain>
explicit hostname = <mapping.label>-<backend.slug>.<domain>
```

`ark-tunnels` rejects overlapping auto-expose ranges among enabled entries sharing one domain. Overlap across different domains is valid.

Because the hostname is deterministic, `ark-dev` and `ark-tunnels` derive the same URL independently. A missing or unhealthy tunnel may produce a warning when detectable, but does not block local application startup.

### Distribution and macOS agent

The Ark package ships `scripts/ark-tunnels.mjs` as an `ark-tunnels` binary. A developer clones the Tenant App and installs its dependencies; no separate tunnel source clone or Raycast installation is required.

The initial interface stays small:

```sh
pnpm exec ark-tunnels install
pnpm exec ark-tunnels status
pnpm exec ark-tunnels status --json
pnpm exec ark-tunnels restart
pnpm exec ark-tunnels uninstall
```

`install` verifies the external `frpc` dependency, copies the tunnel agent to a stable user-owned location, installs one macOS LaunchAgent, and starts it. The LaunchAgent must not point into a tenant's replaceable `node_modules` tree. Local config and generated state live under `~/.config/ark-tunnels`.

One persistent agent owns listener scanning, range matching, generated `frpc` configuration, process supervision, status, and recovery for all configured backends. The CLI and tests cross that same interface instead of duplicating tunnel logic.

### Optional menu-bar app

The native SwiftUI `MenuBarExtra` app provides macOS status and controls without Raycast. Install it from any Tenant App that depends on Ark:

```sh
pnpm exec ark-tunnels menubar install
```

It starts at login, reads the agent's generated `status.json`, and shows every active local port with its public URL. A port row can open or copy its URL. The footer can restart the agent or reveal `backends.json`; uninstall it with `pnpm exec ark-tunnels menubar uninstall`.

The app is a thin adapter over the agent interface and may only:

- display backend and agent health;
- show, copy, and open active URLs;
- request restart or repair;
- open configuration help.

It contains no listener scanning, FRP rendering, or process-supervision logic. The local installer builds the app from the Swift sources shipped in the Ark package and places it at `~/Applications/Ark Tunnels.app`. A signed app can later be distributed through a GitHub release or Homebrew cask. The menu-bar app is not required for tunnel operation.

Remote `frps`, wildcard DNS, and TLS remain generic Studio infrastructure and are not distributed with the local Ark package.

## Stage and production

`ark-dev` is development-only and must refuse to run with `NODE_ENV=production`. Stage and production use fixed resource names from their Coolify env and never interpret `ARK_DEV_*` values.

Each tenant follows the same branch lifecycle:

```text
feature branch -> PR to dev -> stage deploy -> validation
dev -> Release PR to main -> production deploy
```

`main` advances only through a tested Release PR except for an explicitly declared emergency. Emergency changes are immediately merged back into `dev`.

The developer-facing commands remain `pnpm dev` and `pnpm check`. Coolify performs the existing production-mode build and starts with migrations before the app process. Tenant startup reconciles Bootstrap Data, and Coolify health checks determine deployment success.

## Future production-to-stage refresh

Bootstrap Data must always be sufficient to create a useful clean environment. Once production contains representative data, a separate tenant-owned workflow may refresh fixed stage resources:

```text
production Postgres
-> sanitize before import
-> replace fixed stage database
-> copy an approved S3 subset into fixed stage buckets
-> rebuild Meilisearch from sanitized stage data
-> smoke test
```

Unsanitized production data is never restored into stage, even temporarily. Meilisearch indexes are derived and are rebuilt rather than copied. S3 selection and reference rewriting are tenant policy. Development Cells are never touched by a stage refresh.

## Rollout status

The generic `ark-dev` and `ark-tunnels` binaries, config migration, LaunchAgent,
tests, and initial tenant repository wiring are implemented. The remaining
operational rollout is intentionally credential-dependent:

1. Put each Studio's stage Postgres, Meilisearch, S3, and FRP credentials into
   developer-local configuration.
2. Install the agent without replacing the old Horse agent until the migrated
   backend ranges and generated URLs have been inspected.
3. Per tenant, validate one existing Cell, one fresh Cell, reset, destroy, local
   auth, public tunnel auth, direct-upload CORS, provider isolation, automatic
   port appearance/removal, and agent recovery.
4. Retire the legacy Horse LaunchAgent after the new agent has passed those
   checks.
5. Optionally build the signed SwiftUI menu-bar adapter after the CLI/agent
   workflow is stable, without moving tunnel logic into it.
