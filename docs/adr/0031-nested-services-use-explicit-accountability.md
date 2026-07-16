# ADR 0031: Nested services use explicit Accountability

Ark follows Directus service composition for authorization context. A nested Resource or Domain Service receives the caller's Accountability explicitly when it is constructed or invoked. Operations therefore continue to run as the authenticated user and acting space, with the same applicable roles, grants, Row Policies, and Field Policies; entering a Filter or Action does not itself grant additional authority.

Trusted code may explicitly request system Accountability for an internal operation that must bypass user permissions. That elevation must be visible at the call site and narrowly scoped to the intended service operation. It does not bypass the Resource Lifecycle, schema validation, domain invariants, required Actions, or transaction rules.

Ark must not interpret an accidentally omitted Accountability value as permission to elevate. Service APIs should distinguish explicit system Accountability from missing request context so a nested call cannot silently become administrative.
