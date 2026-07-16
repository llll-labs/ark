# Relations reuse Resource read permissions

Ark has no separate relation-permission model. A relation returns its permitted reference value by default, while explicit expansion reuses the target Resource's existing read permission, Row Policy, and Field Policy; without target read access, nested data is not expanded. Initial Row Policies operate on direct columns and trusted context variables only, deferring relational policy traversal until a concrete requirement justifies its complexity.
