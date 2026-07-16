# ADR 0032: Hooks use the Directus callback shape

Ark copies the Directus callback shape for Resource hooks:

```ts
filter(event, (payload, meta, context) => payload)
action(event, (meta, context) => void)
```

A Filter receives the modifiable operation payload, event-specific metadata, and Hook Context, and returns the payload that continues through the lifecycle. An Action receives event-specific metadata and the same shape of Hook Context. Both synchronous and asynchronous callbacks are supported, with Resource registration providing event-specific TypeScript types.

The per-invocation Hook Context exposes `database`, `schema`, `accountability`, and `services`, matching the useful Directus service-composition shape. During Filters and required Actions, `database` and `services` join the operation transaction. During best-effort Actions they use the normal post-commit database connection. Metadata retains the useful Directus operation facts, including the Resource identifier, affected key or keys where applicable, and the relevant payload or query information for that event.

Ark's previously accepted semantic differences remain: events are targeted names such as `ark.messages.items.create`, Actions are required unless explicitly best-effort, and v1 generic mutations operate on one item. Copying the callback shape does not reintroduce generic cross-resource events or Directus's implicit administrator behavior for missing Accountability.
