# Automation workflow

Use Noodle's non-interactive CLI for supported collection operations. Never start the TUI from an agent.

## Choose the operation

| Need | Command |
| --- | --- |
| Find registered collections | `noodle workspace list --json` |
| Validate registered collection paths | `noodle workspace audit --json` |
| Remove invalid registered paths | `noodle workspace audit --fix --json` |
| Create a starter collection | `noodle collection create <name> --output <parent> --json` |
| Initialize an existing directory | `noodle collection init <dir> --json` |
| Print the request and folder tree | `noodle collection list <dir> --json` |
| Inspect files and environments | `noodle collection inspect <dir> --json` |
| Canonicalize request YAML and valid JSON bodies | `noodle collection format <dir> --json` |
| Validate file formats | `noodle collection audit <dir> --json` |
| Canonicalize valid files | `noodle collection audit <dir> --fix --json` |
| Create a minimal request | `noodle request create <id> --url <url> --method <method> --collection <dir> --json` |
| Update an existing environment variable | `noodle environment set <key> <value> --env <name> --collection <dir> --json` |
| Store or replace a declared secret | `noodle secret set <key> --env <name> --collection <dir> --stdin --json` |
| Inspect declared secret names and sources | `noodle secret list --env <name> --collection <dir> --json` |
| Delete a local vault value without removing its declaration | `noodle secret delete <key> --env <name> --collection <dir> --json` |
| Inspect collection cookies and storage health | `noodle cookie list --collection <dir> --json` |
| Clear cookies or recover unreadable cookie storage | `noodle cookie clear --collection <dir> --json` |
| Download an original response body | `noodle request run <id> --collection <dir> --output <file> --json` |
| Run one, selected, or all requests | `noodle request run <id> ... --json` or `noodle collection run <dir> [<target>...] [--tag <tag>]... [--exclude-tag <tag>]... [--fail-fast] [--delay <milliseconds>] ... --json` |

## Rules

- `request run --output/-o <file>` downloads original received bytes (after normal HTTP decompression), without diagnostic redaction. Use a user-authorized destination. Missing parents are created; existing files are never overwritten. Invalid/existing paths exit `2` before sending. Completed HTTP, post-script, capture, or assertion failures still save the body and retain exit `1`; pre-script and transport failures create no file. Write failures preserve response diagnostics and exit `1`. Successful downloads report `data.result.response.outputFile`.
- Binary responses omit `body` in JSON and report `bodyKind: "binary"`, byte `size`, normalized `contentType`, and optional sanitized `filename`. No bytes or base64 appear in result envelopes. Text results retain the existing redacted body; collection runs and Runner details report binary metadata only. JSON body captures/assertions fail clearly for binary responses, while status, headers, and timing work normally.
- Read `status`, `data`, and `errors` from the one JSON envelope. A successful run exits `0`, any completed request failure exits `1`, and a pre-run configuration failure exits `2`, including `request run` failures before execution.
- `workspace audit` checks registered paths for existence, directory access, and collection-root markers. `--fix` removes invalid paths from global config; authorize this mutation before running it.
- `collection init` only accepts an existing, non-collection directory. It creates missing `settings.yml` and `.environments/development.env` bootstrap files, then registers the absolute path. Existing markers are preserved.
- `collection format` rewrites every request file with canonical YAML and pretty-prints valid JSON bodies. It leaves invalid JSON body text unchanged. Obtain user authorization before running it because it modifies collection files.
- Request IDs are relative paths without `.yml`, such as `users/list`. Do not use traversal, empty segments, or hidden segments.
- `collection run <dir> [<target>...]` accepts bare request IDs and folder paths ending in `/`. Folders include nested requests. Overlapping targets run once in collection order; omit targets to run the whole collection.
- Each repeated `--tag <tag>` requires that effective request tag, so Include tags use AND matching. Each repeated `--exclude-tag <tag>` removes matching requests, so Exclude tags use OR matching and win when both filters match. Targets resolve first, then include and exclude filters run before environment, proxy, TLS, cookie, or request setup. Tag values and YAML tags are case-sensitive; duplicate filters have no additional effect.
- Request tags combine with all ancestor folder tags. Duplicates have no additional effect, tags cannot be removed downstream, and root `folder.yml` remains ignored. A tag-filtered selection with no requests is a configuration failure. An empty collection or explicitly selected empty folder still succeeds when no tag filter is present.
- `--fail-fast` stops after the first failed request. Read executed requests from ordered `data.results` and the remaining selected IDs from ordered `data.skipped` entries with `reason: "fail-fast"`. Filtered requests appear in neither array and cannot change RunScope captures.
- `--delay <milliseconds>` accepts a non-negative safe integer and waits after a completed request only when another selected request remains. Failed requests are followed by the delay when execution continues; fail-fast skips the delay.
- Every request result has `failureCategories` in fixed order. Categories are `configuration`, `execution`, `script`, `transport`, `http`, `capture`, and `assertion`; completed-response `script`, `http`, `capture`, and `assertion` failures may coexist. Human output labels these as configuration error, request error, script failure, transport error, HTTP error, capture failure, and assertion failure. Collection results include `failed`, optional configuration `failure`, and `summary` counts for selection, execution, skips, request outcomes, assertions, captures, duration, and unique failure categories. There are no aggregate script counters.
- A configured request timeout and a redirect refused by Noodle's network-safety checks are `transport` failures. Caller-triggered cancellation propagates to its owner instead of becoming a completed run result. Cross-origin redirects strip sensitive and known-secret headers, disable request auth, and stop before forwarding a preserved body containing a known secret; redirects that discard the body may proceed.
- Every target is validated before the first request is sent. An HTTP status of
  400 or higher, a failed script, a failed response capture, or a failed response assertion makes the command exit nonzero.
  A status assertion cannot turn an HTTP error response into a successful run.
- Requests with `scripts.pre` and/or `scripts.post` return a `scripts` group. Read it from
  `data.result.scripts` for `request run` and `data.results[].scripts` for
  `collection run`. A result contains `phase`, `scope`, `sourceKind`, `success`,
  `durationMs`, redacted `logs`, and an optional normalized error. Human output
  reports script status, duration, log count, and failure, but never log text.
  `evaluated: false` means preparation failed before execution. Requests without
  scripts omit the group. Results retain executed phases in pre/post order.
  Pre failure skips HTTP and response phases. Post failure preserves HTTP and
  captures, rolls back only staged post writes, and still runs assertions.
  Script failure participates in fail-fast after all response diagnostics finish.
- Requests with a `capture` mapping return a `captures` result containing `evaluated` and per-variable results. Human output shows captured and failed counts plus variable and expression names, never values. JSON success results include `variable`, `expression`, `success`, `type`, typed `value`, and optional `persisted`. Failure results include `failureReason` (`missing`, `resolution_error`, or `persistence_error`) and `message`. `persist: secret` values and values captured from sensitive response headers are always fully redacted. `evaluated: false` with an empty `results` array means the request failed before a response was available.
- A collection run shares one RunScope in collection order. Environment values load first, successful captures and script writes override them, and the latest successful write wins. Failed captures or script invocations do not remove earlier committed values. String values substitute verbatim; other JSON values use `JSON.stringify()`. Captures are visible to the same request's post script and later requests and disappear when the command returns. They do not change the already-sent request or resubstitute assertion expectations.
- Successful captures commit before post and assertions and remain available after an HTTP, post, or assertion failure. A capture failure marks the request and aggregate command failed, but the collection continues. Separate run commands never share transient values.
- Requests with an `assert` block return an `assertions` result containing `evaluated` and per-check results. Human output shows pass/fail counts without raw actual values; JSON output recursively redacts known secrets from expected and actual values but preserves arbitrary server data, so treat it as sensitive response data.
- For `request run`, read assertions from `data.result.assertions`; for `collection run`, read each `data.results[].assertions`. Each assertion result contains `expression`, `operator`, optional `expected`, optional `actual`, `passed`, and `message`. `evaluated: false` with an empty `results` array means the request failed before assertions could run; requests without assertions omit the field.
- `request run` and `collection run` use `--env <name>` when supplied. Otherwise they use `settings.yml`'s environment. Without either an environment or an earlier capture, unresolved variables fail before sending.
- Structured results recursively redact known environment, proxy, TLS, request-credential, cookie, and secret-capture values and mask sensitive response headers. A `persist: secret` capture is fully redacted regardless of value. Human capture output never includes values. Arbitrary server payload fields remain visible, so treat all structured run output as sensitive.
- The shared request flow is fixed: merge folder overrides; overlay environment/RunScope; substitute once; execute and commit pre; HTTP; capture commits; execute and commit post; assertions. HTTP/capture errors still reach post; post errors still reach assertions. Transport failures do not run response phases. Successful script RunScope writes remain available to later collection requests after later failures. Request mutations are pre-only and never written back to YAML. Post readers reflect the final prepared HTTP leg.
- Prefer captures for declarative extraction and `scripts.post` for conditional processing, such as `if (noodle.response.status === 201) noodle.run.set("id", noodle.response.json().id)`. Post-response text has a lazy 5 MiB UTF-8 cap; cached JSON stays in the VM and extracted RunScope values retain 256 KiB/depth-32 limits. Cookie access, when available, is final-URL-scoped `get/set/delete`; unknown attributes and domains are rejected, cookies are host-only, and deletion removes all applicable matches. Cookie and RunScope writes commit atomically but cookie durability remains deferred. See [schema](../schema.md#inline-request-scripts) for exact inputs and restrictions.
- Run commands contact remote servers and may write cookie-jar state, bootstrap a `collection_id`, refresh OAuth credentials, and persist declared captures or explicit script environment/secret intents during CLI `request run`. Collection runs suppress both forms of persistence. `persist: environment` updates plaintext and refuses secret downgrades; `persist: secret` stores through the OS vault and can upgrade plaintext. Capture persistence requires the `--env` or settings environment, runs sequentially with partial success, and happens after successful extraction even when HTTP or assertions fail. Script intents use the bounded batch and rollback semantics described above. Run commands do not write response timeline entries or RunScope values into request YAML or collection settings. Execute runs only when the
  user has authorized the request scope, even when the HTTP method is normally
  read-only.
- Treat cookie `data.warnings` as non-fatal diagnostics. Run results can succeed while warning that cookie storage is plaintext or unavailable; unavailable jars are skipped for that run. `cookie list` also reports `data.state`, warnings, and `hostOnly` for every cookie.
- Treat every `cookie list` value as sensitive. Do not paste human or JSON output into logs, issues, or shared reports without redaction.
- `cookie clear` is the explicit recovery operation for unreadable cookie storage. It preserves the original file and returns its path in `data.backupPath` before creating a clean jar. Report that backup path to the user.
- Add `--insecure` to `request run` or `collection run` only when the user explicitly authorizes disabling TLS certificate verification for that invocation.
- `secret set` creates or updates the blank `# @secret KEY` declaration and stores the value in the OS vault. Prefer masked TTY input for humans; use `--stdin` only when automation can supply the value without exposing it in arguments or logs. `environment set` refuses declared secret keys.
- `collection audit --fix` writes canonical forms for valid files. Obtain user authorization before running it.

## Fall back to files

Use direct YAML/dotenv edits when the CLI cannot express the change: folders and inheritance, request headers, params, auth, bodies, form data, inline pre/post scripts, captures, assertions, new environment files, and manual conversions. After edits, run `noodle collection audit <dir> --json` and, when appropriate, execute the affected request sequence.
