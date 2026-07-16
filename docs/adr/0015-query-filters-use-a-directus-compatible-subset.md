# Query filters use a Directus-compatible subset

Generic Resource queries use Directus-compatible filter objects and REST query encoding. V1 supports direct readable fields, logical `_and` and `_or`, and the common equality, comparison, membership, null, and string operators; client filters are combined with Row Policies using AND. Relational traversal, SQL fragments, functions, geometry, and aggregation are excluded initially, and filtering or sorting by fields outside the read Field Policy is rejected.
