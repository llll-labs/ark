# V1 REST uses Better Auth sessions

V1 REST authenticates browser requests through existing Better Auth session cookies and resolves Ark users, memberships, roles, and Resource Permissions from that session; anonymous requests use Ark's existing public role. Chat WebSockets reuse the same session identity. Personal access tokens, service accounts, token scopes, rotation, and revocation are deferred so the transport migration does not also redesign authentication.
