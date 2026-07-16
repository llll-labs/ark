# Deletion policy is explicit

Every Resource explicitly declares deletion as disabled, hard, soft through a configured archive field and value, or domain-managed. Adopted Resources default to disabled, and generic CRUD never infers soft deletion from column names. Enabling deletion still requires a Resource Permission; domain-managed deletion is exposed only through its specialized Domain Operation.
