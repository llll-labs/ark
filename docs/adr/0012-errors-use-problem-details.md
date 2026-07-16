# Errors use Problem Details

All Ark REST errors use RFC 9457 `application/problem+json` with the standard `type`, `title`, `status`, `detail`, and `instance` members. Ark adds stable machine-readable `code`, request correlation through `requestId`, and structured field errors where relevant. HTTP status and problem status must agree, and endpoints do not return error objects inside successful responses.
