# ADR 0030: Nested Resource lifecycles run depth-first

When a Filter, Required Action, or Domain Service invokes another Resource operation, the nested operation runs its complete lifecycle immediately and depth-first. If the caller explicitly passes the current transaction, the nested filters, write, and required actions participate in that same transaction. The parent handler resumes only after the nested lifecycle succeeds or fails. A best-effort Action runs after the parent commit, so any Resource operation it starts is a new operation rather than part of the committed lifecycle.

This follows ordinary Directus service composition and preserves a predictable synchronous call model. A nested failure propagates normally and rolls back the shared transaction when required. The nested operation still applies its own authorization, Row Policy, Field Policy, validation, and targeted lifecycle events; nesting is not a lifecycle bypass.

Code that intentionally performs an internal operation without re-emitting lifecycle events must request `emitEvents: false` explicitly. That escape hatch exists for controlled recursion prevention, not as the default for nested writes. Durable external effects remain outbox work rather than nested synchronous Resource operations.
