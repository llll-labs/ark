# ADR 0029: Transactions are propagated explicitly

Ark v1 follows the Directus service pattern for transaction propagation. The top-level Resource or Domain Service owns the operation transaction. Filters and required Actions use that transaction, and a nested service joins it only when the caller explicitly supplies the current database transaction while constructing or invoking the nested service. Ark does not initially provide ambient transaction inheritance or forbid a nested service from using its default database connection.

This keeps the v1 service model close to Directus and makes transaction participation visible at the call site. Callers coordinating multiple Resources or Internal Tables are responsible for passing the transaction consistently. Durable external effects still use the transactional outbox. Best-effort Actions run only after commit and therefore do not receive the completed operation transaction.

The tradeoff is deliberate: omitting the transaction can cause work to run outside the parent operation and may create lock or consistency problems. Tests and service APIs should make the expected transaction parameter obvious. Mandatory inheritance through a broader Operation Context may be reconsidered after practical experience.
