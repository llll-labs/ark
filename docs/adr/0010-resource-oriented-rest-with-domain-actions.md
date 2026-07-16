# Resource-oriented REST with domain actions

Ark REST endpoints prefer resources, subresources, and standard HTTP methods. A specialized Domain Operation that cannot honestly be represented as CRUD uses `POST /api/ark/.../:id/actions/:verb`; Ark will not recreate RPC through a generic command endpoint. Routes are thin adapters over Domain Services, so REST shape does not become the location of domain behavior.
