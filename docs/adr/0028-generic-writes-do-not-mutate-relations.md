# Generic writes do not mutate relations

V1 generic Resource mutations accept permitted scalar foreign-key values but do not create, update, or delete related items. Related Resources are mutated through their own endpoints, while Domain Services may coordinate multi-table aggregate writes inside an explicit transaction. Relation expansion remains available for reads through the target Resource's normal permissions.
