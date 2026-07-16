# Physical tables require explicit adoption

Ark discovers eligible physical tables but does not expose them automatically. An administrator may explicitly adopt an unmanaged table as a generic Resource, which creates Ark metadata with closed permissions while leaving the physical schema and migration history unchanged. Domain specialization still requires code registration, and a code registration for the same resource identifier takes precedence over or enriches the adopted definition.
