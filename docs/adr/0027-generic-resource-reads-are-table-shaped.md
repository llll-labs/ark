# Generic Resource reads are table-shaped

Ark follows Directus's database-mirroring approach for generic reads. Adopted Resources expose permitted table fields, and a Code Resource opting into generic read identifies a primary table and its exposed fields; explicit relation expansion may retrieve related Resources through their normal permissions. Computed or hydrated aggregate projections belong to Domain REST endpoints, and domains that cannot safely expose a table-shaped representation leave generic read disabled.
