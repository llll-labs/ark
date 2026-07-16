# Code registration is authoritative

When code registers a Resource identifier previously adopted through the UI, code becomes authoritative for its table binding, schemas, lifecycle behavior, specialized services, and deletion policy. Compatible UI presentation metadata and Resource Permission grants remain, but UI metadata cannot override code-owned behavior. Schema or table mismatches fail preflight rather than silently falling back to the adopted definition.
