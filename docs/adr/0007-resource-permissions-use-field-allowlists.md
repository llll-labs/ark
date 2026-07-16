# Resource permissions use field allowlists

Each Resource Permission declares the fields its operation may access. Read responses omit fields outside the allowlist, while create and update requests containing forbidden fields are rejected rather than silently stripped; filtering, sorting, and relation expansion may use only readable fields. Code Resources may further restrict the allowlist, and an empty allowlist grants no usable data access.
