# Only Ark Resources use an ownership prefix

Ark-owned physical Resources use identifiers such as `ark.messages`, preserving the core schema ownership boundary. Tenant-owned tables in the default `public` schema use bare identifiers such as `jobs`, without a redundant `public.` or tenant-specific prefix. The identifier is shared by REST paths, permissions, hooks, and metadata; UI display labels remain independently configurable.
