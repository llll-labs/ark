# REST is the only API transport

Ark exposes both generic Resource operations and specialized Domain Operations through REST. Generic CRUD lives under `/api/ark/items/:resource`; domain endpoints remain explicit and semantic, but tRPC is removed rather than retained as a second transport or canonical contract. Existing Ark consumers will require migration, which is accepted to avoid permanent transport duplication and frontend-backend coupling before v1.
