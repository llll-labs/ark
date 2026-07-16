# Generic mutations are single-item

V1 generic Resource CRUD creates, updates, or deletes one item per request. Ark does not initially support array creates or update/delete by key lists or Query Filter because batch transactions, per-item policies, hooks, failures, and outbox behavior are not yet defined. Domain Services may expose specialized bulk operations with explicit semantics.
