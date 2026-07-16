# Fields use Directus-compatible selection

Generic Resource reads use the Directus-compatible `fields` parameter. Omitting it or requesting `*` returns all readable top-level fields, while dot notation explicitly expands relations through the target Resource's normal read, row, and field policies. V1 excludes deep wildcards such as `*.*`, applies hard depth and result-size limits, and rejects requests for forbidden fields.
