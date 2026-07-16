# UI collections use shared storage

Collections created through the Ark UI remain logical collections backed by `ark.collections`, `ark.fields`, and the shared `ark.items` storage, so no-code schema changes do not execute runtime DDL or enter tenant migration chains. Code-owned resources use real physical tables, checked-in migrations, and explicit resource registration because they require stable schemas, native constraints, and domain-specific behavior. Ark therefore supports both flexible managed content and typed application data without pretending they have the same ownership lifecycle.
