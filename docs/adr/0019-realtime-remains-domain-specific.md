# Realtime remains domain-specific

V1 preserves chat's specialized WebSocket events while all commands and queries move to REST. Realtime messages are targeted invalidation signals that prompt clients to refetch authoritative state; they are not an alternative data API. Generic Resource subscriptions and change streams are deferred until a concrete non-chat requirement justifies them.
