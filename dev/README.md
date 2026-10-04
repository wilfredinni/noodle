# Local development

Run commands from the repository root:

```bash
bun run dev
bun run dev:server
bun run dev:check
```

`dev` starts the services and opens the local collection with the watched TUI.
`dev:server` runs only the services. `dev:check` uses a temporary collection and
an in-memory credential backend to run positive, negative, and dataset suites.
Cookie data and locks also stay inside the check's temporary workspace.
The original fixture files are never rewritten by the check.

Services bind to loopback: HTTP 4400, HTTPS 4401, second HTTP origin 4402,
authenticated proxy 4403, and self-signed HTTPS 4404. Port conflicts fail startup
and close services already started. The proxy permits only these local destinations. Stop with Ctrl+C;
leaving the TUI also stops its services.

The collection uses a bundled development CA and client certificate. Its keys
and credentials are public test fixtures. They are not suitable for deployment.
Credentials are `User` / `Password`, bearer `noodle-dev-token`, API key
`noodle-dev-api-key`, OAuth client `noodle-client` / `noodle-client-secret`,
and proxy `proxy-user` / `proxy-pass`. NTLM uses domain `Domain`.

Request and folder YAML reference secret-marked variables in the development
environment. `bun run dev` supplies the public fixture values only to its default
collection's child process; `dev:check` seeds its in-memory credential backend.
When opening the collection directly with Noodle alongside `dev:server`, set
those variables to the fixture values in [auth.ts](auth.ts) through the
environment editor or `noodle secret set` first.

In F5, select suites by folder or tags. `smoke` runs positive automated cases,
`negative` contains intentional failures, `interactive` contains browser auth,
cancellation, and persistence, and `dataset` requires an iteration file. Select
only `scripting-data/` for its CSV/JSON files. Scripts and file references resolve
from the development collection; uploads use portable repository-relative paths.

OAuth authorization-code and implicit examples open the system browser and use
the callback `http://127.0.0.1:8765/oauth/callback`. The local provider grants the
fixture user automatically. Use its `deny=true` authorization parameter to
exercise denial. Credentials and tokens use Noodle's normal storage when running
the TUI; the check uses isolated temporary fixtures.

The API keeps CRUD state in memory. Send POST `/reset` or restart the services
to restore known users, posts, comments, albums, photos, and todos. GET `/requests`
reports method/path and proxy destinations without recording credentials or bodies.
POST `/oauth/expire` with a form field `token` expires an issued OAuth token
immediately, so expiration checks do not need to wait for a clock deadline.

| Capability                                                       | Collection scenarios                                                 | Automated validation                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| HTTP methods, params, headers                                    | `http/`                                                              | `smoke`                                                                                                           |
| Redirects, body preservation, limits                             | `redirects/`, `templates/redirect-reuse`, `negative/redirect-loop`   | `smoke`, expected transport failure                                                                               |
| JSON, XML, forms, binary uploads                                 | `bodies/`                                                            | `smoke`                                                                                                           |
| Response formats, sizes, empty bodies, repeated headers          | `responses/`                                                         | `smoke`, byte-for-byte download check                                                                             |
| HTTP failures, slow responses, timeout, disconnect, cancellation | `timing/`, `negative/`, `interactive/cancellation`                   | Expected categories, cancellation check                                                                           |
| Basic, Bearer, API key, inheritance                              | `auth/basic/`, `auth/tokens/`, `negative/`                           | `smoke`, rejection cases                                                                                          |
| OAuth 1 signatures and placements                                | `auth/oauth1/`                                                       | `smoke`, invalid-signature case                                                                                   |
| OAuth 2 grants, PKCE, discovery, JWT client auth                 | `auth/oauth2/`, `interactive/oauth-*`                                | `smoke`, five real Noodle callbacks, denial/state/PKCE/replay/expiry/refresh checks                               |
| NTLMv2 and AWS SigV4                                             | `auth/ntlm/`, `auth/aws/`                                            | `smoke`, connection binding, replay, binary payload, tampering and credential rejection                           |
| Trusted/self-signed TLS, mTLS, proxy                             | `tls/`, `negative/selfsigned-untrusted`                              | Trusted/untrusted/insecure TLS, encrypted and plain client keys, HTTP proxy, HTTPS CONNECT, proxy auth and bypass |
| Variables, captures, secrets, persistence                        | `scripts/`, `interactive/persistent-*`                               | Capture order, RunScope, persistence and redaction checks                                                         |
| Inline/external/inherited scripts and chaining                   | `scripts/`, `async-scripting/`, `external-scripts/`, `transactions/` | `smoke`, rollback and error/limit cases                                                                           |
| Assertions and scripted tests                                    | `assertions/`                                                        | All operators and matchers, sync/async tests, JSON Schema, intentional failures                                   |
| Cookies                                                          | `cookies/`, `transactions/`, `runner-data/`                          | Scope, attributes, expiration, suppression, encrypted persistence, post changes and rollback                      |
| Runner and datasets                                              | `runner/`, `scripting-data/`, `runner-data/`                         | Targets, overlap, tags, CSV/JSON isolation, delay, fail-fast and skips                                            |
| Body templates                                                   | `templates/`                                                         | Full random/time catalogs, types, preparation before pre, redirect reuse and password redaction                   |

The dedicated development tests cover protocol rejection, OAuth callbacks and
renewal, TLS, proxy isolation, startup/cleanup, Runner behavior, and persistence.
Existing product tests continue to cover editors, UI interaction, imports/exports,
installation, and updates.
