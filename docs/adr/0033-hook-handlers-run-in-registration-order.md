# ADR 0033: Hook handlers run in registration order

Filters registered for the same targeted lifecycle event execute sequentially in registration order. They form a payload waterfall: each Filter receives the payload returned by the preceding Filter, and its returned payload becomes the input to the next Filter. The final Filter result continues to the Resource write.

Required Actions execute sequentially in the same registration order after the write. Each required Action completes before the next one starts, and a failure stops the chain and rejects the shared transaction.

After commit, best-effort Actions are dispatched asynchronously in registration order without blocking the request or one another. Their completion order is not defined, and each failure is logged independently.

Ark does not depend on filesystem discovery order. Resource and module registration must produce a stable order so identical registrations have identical Filter transformation, required Action, and best-effort dispatch order. Nested operations from Filters and required Actions remain depth-first: a handler's nested lifecycle completes before the next handler in the parent chain begins.
