# Only public tables are discovered

V1 discovery considers tenant-owned tables in the default `public` schema only. Ark-owned `ark.*` tables are code-owned and receive their Resource Definitions through code registration, never UI adoption; database system schemas, extension schemas, migration journals, and arbitrary custom schemas are excluded. Supporting additional tenant schemas is deferred until their identifier and collision rules are deliberately designed.
