# Runtime schemas generate API contracts

Every Ark REST endpoint is defined by code-owned runtime schemas for its parameters, request body, response, and errors. Route metadata and those schemas generate OpenAPI, TypeScript types, optional typed clients, runtime validation, and contract tests from one source; Ark will not maintain handwritten OpenAPI alongside separate validation schemas. Resource and Domain Service schemas own the data contracts, while route files only bind them to HTTP.
