# ADR 0036: Directus is the default for Resource semantics

For generic Resource behavior not otherwise decided, Ark v1 follows Directus's documented API and stable item-service semantics. Ordinary questions about hook shape, payload processing, query behavior, permission evaluation, service composition, and REST conventions therefore default to the Directus answer without requiring a new Ark-specific design.

A material deviation from Directus requires an explicit decision. Existing deviations remain authoritative, including targeted resource event names without generic hooks, transactional required Actions plus Directus-style best-effort Actions, no generic bulk or deep relational writes in v1, no generic Activity or realtime in v1, no server-applied permission presets in v1, Better Auth sessions, Ark's space actor model, and Code Resource domain boundaries.

Compatibility targets documented or intentionally stable behavior, not incidental implementation bugs. Where Directus operations behave inconsistently across create, update, or delete because of implementation details, Ark may preserve its own already documented invariant rather than reproduce the inconsistency. The architecture documentation should call out such exceptions where they affect observable behavior.
