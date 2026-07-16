# ADR 0034: Actions use a transactional and post-commit hybrid

Ark distinguishes required Actions from best-effort Actions. Required Actions are awaited sequentially after the Resource write but before commit, using the operation transaction. A required Action failure rejects and rolls back the whole Resource operation.

Best-effort Actions follow Directus's Action behavior instead: Ark dispatches them asynchronously only after the Resource transaction commits, using the normal database connection rather than the completed transaction. The request does not await them, and a failure is logged without changing the already committed Resource operation. They do not use transaction savepoints.

This hybrid preserves Ark's stronger hook for domain-consistency work while keeping nonessential reactions simple and isolated from the main transaction. A best-effort Action provides neither atomicity nor durable delivery. Work that must eventually happen after commit belongs in the transactional outbox, while logic that must succeed atomically belongs in a required Action.
