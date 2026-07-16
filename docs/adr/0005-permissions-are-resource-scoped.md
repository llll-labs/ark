# Permissions are resource-scoped

Every Resource defines permissions per operation, such as `legacy_jobs.items.read` and `legacy_jobs.items.update`. Adoption creates no grants; administrators explicitly assign operations to roles through Ark's permissions UI. Generic capabilities such as `items.update` must not confer access across unrelated Resources, and code-owned policy may further restrict a granted operation but may not bypass its resource-level grant.
