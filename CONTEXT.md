# Ark

Ark is a tenant application platform that combines a generic resource foundation with installable domain modules.

For unspecified generic Resource behavior, Ark v1 follows Directus's documented API and service semantics. Ark-specific deviations are explicit decisions rather than accidental incompatibilities; implementation bugs or inconsistent edge behavior in Directus are not compatibility targets.

## Language

**Ark**:
A tenant application platform composed of a stable generic foundation and domain modules.
_Avoid_: Monolithic tenant backend, database wrapper

**Resource**:
A stable data boundary exposed to the platform's shared lifecycle. An adopted Resource maps to one table, while a code-owned Resource may coordinate multiple tables behind domain behavior.
_Avoid_: Raw table, collection

**Domain Module**:
An installable capability area that owns domain-specific behavior while participating in Ark's shared resource lifecycle.
_Avoid_: Core special case, tenant patch

**Resource Lifecycle**:
The mandatory path through which normal resource operations enforce policy, preserve domain rules, and expose dependable lifecycle events.
_Avoid_: Direct table access, optional hook path

**Filter**:
A blocking resource lifecycle handler that may inspect, change, or reject an operation before its write is applied.
_Avoid_: Before hook, validator

**Action**:
A resource lifecycle handler that reacts after a write. An Action is required unless explicitly registered as best-effort.
_Avoid_: Unclassified after hook

**Required Action**:
An Action awaited after the write inside the operation transaction. Its failure rejects and rolls back the operation.
_Avoid_: Background invariant, ignored failure

**Best-effort Action**:
An Action dispatched asynchronously after the operation commits. Its failure is logged without rejecting the completed Resource operation, so it is reserved for non-durable reactions that do not protect domain consistency.
_Avoid_: Required invariant, durable delivery

**Transaction Context**:
The database transaction explicitly passed into a Resource or Domain Service for one operation. As in Directus, a nested service joins the current transaction only when its caller supplies that transaction while constructing or invoking it; transaction inheritance is not ambient or automatic in v1.
_Avoid_: Implicit transaction, automatic nested transaction

**Nested Resource Operation**:
A Resource operation started synchronously by a Filter, Required Action, or Domain Service. When given the parent's Transaction Context, its complete lifecycle runs immediately and depth-first before the caller resumes.
_Avoid_: Deferred hidden write, lifecycle bypass

**Accountability**:
The authorization context passed to a Resource or Domain Service, including the authenticated user, acting space, and applicable roles or grants. Nested services receive the caller's Accountability explicitly; trusted code must explicitly request system Accountability when user permissions must be bypassed.
_Avoid_: Implicit admin, hook privilege

**Hook Context**:
The Directus-shaped per-invocation context passed to a Filter or Action callback. It exposes `database`, API `schema`, and `accountability`; `database` is the operation transaction for Filters and Required Actions, and the normal connection for post-commit Best-effort Actions. Service constructors come from the hook registration scope.
_Avoid_: Global request state, ambient transaction

**Handler Chain**:
The ordered handlers registered for one lifecycle event. Filters form a sequential payload waterfall, and required Actions run sequentially after the write; registration order determines execution order.
_Avoid_: Parallel hooks, unspecified ordering

**Effective Payload**:
The payload returned by the Filter chain. Following Directus, Ark applies operation permission, writable Field Policy, schema validation, and final-state Row Policy to this payload before writing it.
_Avoid_: Raw client payload after hooks, unvalidated hook output

**Resource Identifier**:
A stable name used consistently across APIs and lifecycle events. Ark-owned Resources use the `ark.` ownership prefix, such as `ark.messages`; tenant-owned tables in `public` use bare names, such as `jobs`.
_Avoid_: `public.` prefix, tenant-specific prefix for public tables

**Code Resource**:
A Resource whose schema contract and domain behavior are owned in code and may coordinate one or more physical tables.
_Avoid_: Managed collection, dynamic table

**Internal Table**:
A physical table that supports a Code Resource or external subsystem without becoming an independently addressable Resource.
_Avoid_: Hidden Resource, generic CRUD target

**Resource Definition**:
The authoritative identity, schema contract, and behavior of a Resource. Code registration takes precedence over adopted metadata for executable behavior.
_Avoid_: Admin layout, inferred table shape

**Managed Collection**:
A collection defined through the Ark UI and stored in Ark's shared item storage rather than in its own physical table.
_Avoid_: UI-created table, code resource

**Unmanaged Table**:
An eligible physical table detected by Ark that has neither code registration nor resource metadata. It is visible to administrators for discovery but is not exposed through resource operations.
_Avoid_: Resource, hidden API

**Adopted Resource**:
An unmanaged table that an administrator has explicitly enabled for generic Ark resource behavior. Adoption adds Ark metadata without changing the table or creating a migration.
_Avoid_: Code resource, automatic exposure

**Resource Permission**:
A role grant for one operation on one namespaced Resource. Resources begin with no granted operations.
_Avoid_: Global CRUD grant, implicit access

**Row Policy**:
A declarative predicate attached to a Resource Permission that limits the rows on which its operation is allowed. It is enforced as part of the database operation.
_Avoid_: Post-query filter, arbitrary policy code

**Field Policy**:
An allowlist attached to a Resource Permission that defines which fields its operation may read or write.
_Avoid_: Response-only masking, silent input stripping

**Relation Expansion**:
An explicit request to include data from a related Resource. It reuses the target Resource's normal read, row, and field policies rather than defining separate relation permissions.
_Avoid_: Implicit deep read, relation grant

**Domain Operation**:
A semantic command or query owned by a Domain Module that preserves behavior not expressible as generic Resource CRUD.
_Avoid_: Router procedure, custom CRUD endpoint

**Domain Event**:
A targeted notification that meaningful domain state changed. It prompts clients to refetch authoritative state rather than carrying a second copy of that state.
_Avoid_: Resource lifecycle hook, realtime data replica

**API Contract**:
The code-owned runtime schemas and route metadata that define an endpoint and generate its OpenAPI description and typed clients.
_Avoid_: Handwritten OpenAPI copy, transport-inferred type

**Problem**:
An RFC 9457 error response with a stable Ark code, request identifier, and optional field-level details.
_Avoid_: Ad hoc error object, successful response containing an error

**Query Filter**:
A Directus-compatible declarative predicate supplied by a client to narrow a Resource query. It is combined with the caller's Row Policy and cannot broaden access.
_Avoid_: Lifecycle Filter, SQL fragment

**Deletion Policy**:
A Resource's explicit choice to disable deletion, hard-delete items, soft-delete through a declared archive field, or delegate deletion to domain behavior.
_Avoid_: Column-name inference, implicit delete

## Delivery and environments

**Studio**:
An operational boundary that owns infrastructure, provider credentials, domains, and deployment systems for one or more Tenant Apps.
_Avoid_: Tenant, application group, naming prefix

**Tenant App**:
A separately deployed product application that extends Ark and owns its product schema, data lifecycle, integrations, and environment configuration.
_Avoid_: Studio, Ark instance, space

**Development Slot**:
A developer-specific identity allocated separately for each Tenant App and shared with the matching Horse backend entry.
_Avoid_: Port, environment, developer account

**Development Cell**:
One persistent remote development instance identified by a Development Slot and a local port. It has an isolated database, search indexes, and physical storage buckets.
_Avoid_: Stage, local cell, preview deployment

**Cell ID**:
The canonical name of a Development Cell, reused across its remote resources and public development hostname.
_Avoid_: Database prefix, bucket prefix, tunnel slug

**Bootstrap Data**:
Required app-owned records that are reconciled idempotently after migrations in every environment.
_Avoid_: Fixture, production snapshot, one-time seed

**Fixture**:
Disposable example or test data that is never required for a Tenant App to boot correctly.
_Avoid_: Bootstrap Data, sanitized production data

**Sanitized Production Snapshot**:
A deliberately transformed subset of production state that is safe to import into stage for representative testing.
_Avoid_: Production backup, Fixture, raw dump

**Release PR**:
A pull request that promotes the tested `dev` branch into `main`, causing the production deployment.
_Avoid_: Feature PR, direct production commit
