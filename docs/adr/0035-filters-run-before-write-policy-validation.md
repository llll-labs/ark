# ADR 0035: Filters run before write policy validation

Ark follows Directus's item-service ordering for mutation payloads. The Filter chain receives the submitted payload first. Ark then treats the returned Effective Payload as the attempted write and applies the operation permission, writable Field Policy, schema and domain validation, and applicable final-state Row Policy before persistence.

Consequently, a Filter may remove or transform a submitted field before policy validation, but it does not gain authority to persist fields unavailable to the current Accountability. A Filter-added field is checked exactly like any other field in the Effective Payload. Trusted code that intentionally needs broader authority must invoke a service with explicit system Accountability rather than relying on hook position.

Ark does not add server-applied permission presets in v1, despite their place in the equivalent Directus pipeline. Presets remain deferred by the existing roadmap decision. Ark also retains its already chosen uniform transaction guarantee for Filters rather than copying operation-specific transaction-boundary inconsistencies from Directus.
