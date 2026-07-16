# Contributing to `@kurark/ark`

`@kurark/ark` is the reusable, **tenant-agnostic** Ark Nuxt 4 runtime. A tenant
app `extends` it and adds only its own behavior. Ark publishes as its own
package. Everything here protects the property that
lets that happen: **the core stays generic.**

## The one rule: no tenant identity in Ark

Ark must never hardcode a tenant's name, locale, theme, channels, or
sources. These are configured by the consuming app via env or `nuxt.config`:

| Concern | Layer default | App sets it via |
| --- | --- | --- |
| Display name | `Ark` | `NUXT_PUBLIC_APP_NAME` |
| Locale | `en` | `i18n.defaultLocale` in app `nuxt.config` |
| Color theme | system | `colorMode` in app `nuxt.config` |
| Per-user notify bot | auth bot | `TELEGRAM_BOT_TOKEN` |

Before requesting review on any Ark change, **grep your diff for tenant
literals** (a consuming app's name or slug). If you need a new
tenant-configurable value, add a neutral default here plus a runtime-config /
env hook — never a tenant literal.

## What belongs in Ark

Generic Ark runtime:

- `ark.*` tables and the **core** Drizzle chain
- auth, sessions, users, spaces, memberships, roles, capabilities, grants
- channels, messages, reactions, pins, files/storage, realtime
- market **primitives** (`ark.market_stores`, `ark.market_jobs`, …)
- notification **transport**: the `ark.notifications` outbox and `notifyUser()`
  (`server/utils/notifications.ts`). Core owns delivery because it owns the auth
  identities; callers pass a recipient, an event `kind`, and a **pre-localized**
  message.
- `useArk*` composables, core UI (`Ark*`), Resource REST, and domain REST Actions

If something assumes a specific language, sources, or product flow, it is **not**
core — it belongs in the consuming app. The governing question for every change:
**"would another consuming app want this in core?"** If no, keep it in the app
and reach for an extension point.

## Extension points over core edits

~90% of tenant app customization should happen without touching Ark. Prefer:

1. App `runtimeConfig` / env (identity, toggles, secrets).
2. App Nitro plugins + Ark's `app-extensions` / `app-settings` server utils.
3. App-owned routes, components, schema, and migration chain.

If none of those can express the need, the **core is missing a hook** — add a
generic hook here, then use it from the app. Special-casing a tenant in core is
the wrong move.

## Database migrations

Core owns the `ark.*` chain only:

```bash
pnpm db:generate   # generate core migrations from db/schema.ts
pnpm db:migrate    # apply the core chain
```

Never put tenant tables in the core chain. The app runs core migrations before
its own.

## Public surface

New entries in `package.json` `exports` are a compatibility promise. Keep the
surface minimal until a second consumer actually needs an entry point. The same
applies to `files[]` — only ship what a consumer imports or copies (the package
ships `.env.example` and `docker-compose.yml` as consumer starters).

## Before you push

```bash
pnpm typecheck   # nuxi prepare + vue-tsc against tsconfig.nuxt.json
pnpm test        # server util tests
```

Ark is pre-v0 alpha. Source may still move between a tenant app and Ark while
the public API settles — this discipline is what keeps the core a
reusable asset instead of "one tenant's backend with a package.json."
