# Ark Roadmap

## Deferred

### Server-applied Resource Permission presets

Allow create and update permissions to assign trusted values such as the current space or Ark user before persistence. Before implementation, define context variables, whether individual presets are locked or client-overridable, and how presets interact with Field Policies, Row Policies, filters, and code-owned domain behavior.

### Permission-specific validation rules

Allow Resource Permissions to add declarative create and update validation beyond the Resource schema. Initial Resource operations instead use schema validation, Field Policies, targeted filters, code-owned domain validation, and database constraints; add another policy language only when a concrete role-specific validation requirement justifies it.

### Generic bulk mutations

Define atomicity, per-item Row Policy evaluation, filter/action emission, failure reporting, limits, and outbox behavior before adding array creates or update/delete by key lists or Query Filter. Initial generic Resource CRUD mutates one item per request; Domain Services may provide specialized bulk operations with explicit semantics.

### Deep relational writes

Define cross-Resource permissions, transaction ownership, lifecycle event ordering, failure behavior, and limits before allowing generic requests to create, update, or delete related items. V1 generic writes accept scalar foreign keys only; Domain Services coordinate intentional multi-table operations.

### Mandatory transaction inheritance

Evaluate mandatory nested-service transaction inheritance after v1 experience. V1 intentionally follows Directus: callers must explicitly pass the current transaction to nested services. Tooling or stronger service factories may later remove this omission risk without changing operation semantics.

### Optimistic concurrency

Add an explicit optional Resource policy for ETag and `If-Match` preconditions when a real concurrent-editing requirement appears. Initial generic CRUD follows Directus's simpler last-write-wins behavior; Code Resources may enforce domain-specific concurrency independently.

### Resource Activity and revisions

Add mutation accountability and optional item history when concrete audit or recovery requirements justify the storage and privacy cost. V1 records neither a generic Activity Log nor before/after snapshots or deltas; direct database changes would remain outside any future lifecycle-based history.

### Generic Resource realtime

Add permission-aware Resource subscriptions or change streams when a concrete non-chat requirement appears. V1 keeps only domain-specific chat WebSocket invalidation events; clients refetch authoritative state through REST.

### API and service tokens

Add machine authentication when an external integration requirement justifies defining token ownership, Resource scopes, expiration, rotation, revocation, and audit behavior. V1 REST uses Better Auth browser sessions and the existing anonymous role only.

### Origin and CSRF enforcement for Ark REST

Apply trusted-origin and Fetch Metadata validation to cookie-authenticated `/api/ark/*` mutations when the REST security boundary is hardened. V1 leaves explicit CSRF checks to Better Auth's own `/api/auth/*` routes; Ark REST therefore relies on host-only `SameSite=Lax` session cookies, browser CORS behavior, and non-simple JSON requests, with multipart routes requiring separate review.
