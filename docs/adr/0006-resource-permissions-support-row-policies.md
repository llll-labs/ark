# Resource permissions support row policies

A Resource Permission may include a declarative row predicate evaluated against trusted request context, such as accessible space IDs or the current Ark user ID. The predicate constrains reads, updates, and deletes in the database query itself; a grant without a predicate applies to all rows. Code Resources may add stricter policy, while UI-defined policies use a limited query language rather than arbitrary JavaScript or SQL.
