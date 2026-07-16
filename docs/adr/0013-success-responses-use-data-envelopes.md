# Success responses use data envelopes

Ark REST success responses use a consistent `{ data, meta? }` envelope across generic Resources and Domain Operations. Single results and mutations place their representation in `data`, lists use an array plus optional metadata, and successful operations with no representation return HTTP 204. Errors never use the success envelope and instead return Problem Details.
