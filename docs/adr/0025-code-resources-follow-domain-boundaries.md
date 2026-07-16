# Code Resources follow domain boundaries

Code-owned Resources represent stable domain and API boundaries rather than mapping every `ark.*` table one-to-one. A Code Resource may coordinate multiple physical tables through its Domain Service, while junction, support, and Better Auth persistence tables remain Internal Tables and are not independently exposed through generic CRUD. Adopted tenant Resources remain one-table Resources because they have no code-owned aggregate behavior.
