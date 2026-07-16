# ADR 0031: Nested services use explicit Accountability

Ark follows Directus service composition for authorization context. A nested Resource or Domain Service receives the caller's Accountability explicitly when it is constructed or invoked. The transaction-bound `context.services` factory carries that same Accountability into Resource services. It also preserves the authorization mode of the lifecycle that invoked the Hook: an ordinary Resource lifecycle remains subject to registered CRUD grants, while a trusted Domain lifecycle may compose code-owned Resources whose generic CRUD is disabled. Hooks do not elevate from Resource authorization to Domain authorization by themselves.

In either mode, operations continue to run as the authenticated user and acting space, with the same applicable Row Policies and Field Policies. Domain authorization bypasses only the generic operation-enable and capability gate needed for trusted service composition; it does not erase Accountability or row ownership constraints.

Trusted code may explicitly request system Accountability for an internal operation that must bypass user permissions. That elevation must be visible at the call site and narrowly scoped to the intended service operation. It does not bypass the Resource Lifecycle, schema validation, domain invariants, required Actions, or transaction rules.

Ark must not interpret an accidentally omitted Accountability value as permission to elevate. Service APIs should distinguish explicit system Accountability from missing request context so a nested call cannot silently become administrative.
