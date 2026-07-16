# Deletion policy is explicit

Every Resource explicitly declares deletion as disabled, hard, soft through a configured archive field and value, or domain-managed. Adopted Resources default to disabled. Discovery may recognize a conventional `deleted_at` column so the adoption UI can offer soft deletion, but generic CRUD never enables deletion merely because that column exists. Enabling deletion still requires an explicit Resource policy and Resource Permission; domain-managed deletion is exposed only through its specialized Domain Operation.
