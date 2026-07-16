# Resource lifecycle is the write boundary

Ark exposes generic CRUD for resources without specialized behavior and lets domain modules specialize those operations. All normal writes to registered resources must pass through the resource lifecycle so authorization, domain rules, transactions, and hooks remain dependable; routers and modules must not write registered tables directly. Migrations, repair jobs, and controlled imports may bypass the lifecycle explicitly because forcing operational data work through public domain behavior would be unsafe or impractical.
