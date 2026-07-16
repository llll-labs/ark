# Physical Resource Definitions are instance-global

A physical Resource has one Definition per deployed Ark instance because its table, schema contract, lifecycle behavior, and API identity are shared infrastructure. Only instance/root administrators may adopt unmanaged tables, and spaces cannot redefine a physical Resource. Access and row visibility remain space-aware through Resource Permissions and Row Policies, while UI-created Managed Collections remain space-scoped logical definitions.
