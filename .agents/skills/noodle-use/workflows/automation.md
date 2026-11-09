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
| Inspect redacted response details | `noodle request run <id> --collection <dir> --body --headers --cookies` |
| Download an original response body | `noodle request run <id> --collection <dir> --output <file> --json` |
| Run one, selected, or all requests | `noodle request run <id> ... --json` or `noodle collection run <dir> [<target>...] [--tag <tag>]... [--exclude-tag <tag>]... [--fail-fast] [--delay <milliseconds>] [--data <csv-or-json>] ... --json` |

## Rules

- Optional `hooks.setup` and `hooks.teardown` in collection `settings.yml` reference distinct existing saved requests. They surround each nonempty main selection or data row, share that row's variables and cookies, and are excluded from target/tag selection. Setup failure skips mains but still attempts teardown; cancellation starts no further HTTP. Hook-enabled rows carry `stage: "setup" | "main" | "teardown"`, and `data.summary.stages` counts executed, passed, failed, skipped, and cancelled executions per stage. Manual sends and `request run` do not automatically run hooks. See [the hook contract](../schema.md#collection-setup-and-teardown).

- Interrupt `collection run` with Ctrl+C (SIGINT) or SIGTERM to return a partial result and exit `130`. Completed request rows stay in `data.results`; an interrupted row has `cancelled: true`, and unstarted executions appear in `data.skipped` with reason `cancelled`. `data.cancelled` identifies the cancelled run. Summary `completed`, `cancelled`, and `unstarted` satisfy `selected = completed + cancelled + unstarted` and `executed = completed + cancelled`. Cancelled executions are excluded from request failure counts. Finished response diagnostics survive, unfinished script writes roll back, and later phases remain unevaluated. Timeouts remain ordinary failures; exit codes `0`, `1`, and `2` retain their existing meanings. Cancellation cannot undo HTTP effects already sent.

- `request run --output/-o <file>` downloads original received bytes (after normal HTTP decompression), without diagnostic redaction. Use a user-authorized destination. Missing parents are created; existing files are never overwritten. Invalid/existing paths exit `2` before sending. Completed HTTP, post-script, capture, assertion, or test failures still save the body and retain exit `1`; pre-script and transport failures create no file. Write failures preserve response diagnostics and exit `1`. Successful downloads report `data.result.response.outputFile`.
- `request run --body`, `--headers`, and `--cookies` opt into human-readable response sections. They display the existing redacted result and escape terminal controls; arbitrary unknown server data remains visible. Received-cookie values are always masked, including `response.cookies` in JSON. These flags do not change the JSON envelope, success criteria, or download behavior.
- Binary responses omit `body` in JSON and report `bodyKind: "binary"`, byte `size`, normalized `contentType`, and optional sanitized `filename`. No bytes or base64 appear in result envelopes. Text results retain the existing redacted body; collection runs and Runner details report binary metadata only. JSON body captures/assertions fail clearly for binary responses, while status, headers, and timing work normally.
- Read `status`, `data`, and `errors` from the one JSON envelope. A successful run exits `0`, any completed request failure exits `1`, and a pre-run configuration failure exits `2`, including `request run` failures before execution.
- `workspace audit` checks registered paths for existence, directory access, and collection-root markers. `--fix` removes invalid paths from global config; authorize this mutation before running it.
- `collection init` only accepts an existing, non-collection directory. It creates missing `settings.yml` and `.environments/development.env` bootstrap files, then registers the absolute path. Existing markers are preserved.
- `collection format` rewrites every request file with canonical YAML and pretty-prints valid JSON bodies. It leaves invalid JSON body text unchanged. Obtain user authorization before running it because it modifies collection files.
- Request IDs are relative paths without `.yml`, such as `users/list`. Use forward slashes even on Windows; do not use traversal, empty segments, or hidden segments. On Windows, request, folder, collection, and environment names also reject forbidden filename characters, trailing dots/spaces, and reserved device names.
- `collection run <dir> [<target>...]` accepts bare request IDs and folder paths ending in `/`. Folders include nested requests. Overlapping targets run once in collection order; omit targets to run the whole collection.
- Each repeated `--tag <tag>` requires that effective request tag, so Include tags use AND matching. Each repeated `--exclude-tag <tag>` removes matching requests, so Exclude tags use OR matching and win when both filters match. Targets resolve first, then include and exclude filters run before environment, proxy, TLS, cookie, or request setup. Tag values and YAML tags are case-sensitive; duplicate filters have no additional effect.
- Request tags combine with all ancestor folder tags. Duplicates have no additional effect, tags cannot be removed downstream, and root `folder.yml` remains ignored. A tag-filtered selection with no requests is a configuration failure unless setup or teardown is configured; hook-enabled empty main selections succeed without HTTP. An empty collection or explicitly selected empty folder still succeeds when no tag filter is present.
- `--fail-fast` stops main requests after the first failure, but still attempts teardown for the started row unless cancelled. Setup failure skips that row's mains with `setup-failed`; later rows use `fail-fast`. Read executed requests from ordered `data.results` and the remaining selected IDs from ordered `data.skipped` entries with `reason: "fail-fast"` or `"setup-failed"` as applicable. Filtered main requests appear in neither array and cannot change RunScope captures.
- `--delay <milliseconds>` accepts a non-negative safe integer and waits after a completed request only when another selected request remains. Failed requests are followed by the delay when execution continues, including teardown after fail-fast; skipped requests add no delay.
- Every request result has `failureCategories` in fixed order. Categories are `configuration`, `execution`, `script`, `transport`, `http`, `capture`, `assertion`, and `test`; completed-response `script`, `http`, `capture`, `assertion`, and `test` failures may coexist. Human output labels these as configuration error, request error, script failure, transport error, HTTP error, capture failure, assertion failure, and test failure. Collection results include `failed`, optional configuration `failure`, and `summary` counts for selection, execution, skips, request outcomes, assertions, captures, duration, and unique failure categories. Pre/post scripts have no aggregate counters; test groups add the test counters described below.
- A configured request timeout and a redirect refused by Noodle's network-safety checks are `transport` failures. Caller-triggered collection cancellation marks the interrupted result `cancelled: true` instead of a failure category and returns a partial run result. Cross-origin redirects strip sensitive and known-secret headers, disable request auth, and stop before forwarding a preserved body containing a known secret; redirects that discard the body may proceed. Body checks cover literal text and form fields/filenames, not binary or multipart file contents or every encoded representation.
- Every target is validated before the first request is sent. An HTTP status of
  400 or higher, a failed script, a failed response capture, a failed response assertion, or a failed scripted test/group makes the command exit nonzero.
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
- The shared request flow is fixed: merge folder overrides; overlay environment/RunScope; substitute once; execute and commit pre; HTTP; capture commits; execute and commit post; assertions; scripted tests. HTTP/capture errors still reach post; post errors still reach assertions and tests. Transport failures do not run response phases. Successful script RunScope writes remain available to later collection requests after later failures. Request mutations are pre-only and never written back to YAML. Post readers reflect the final prepared HTTP leg.
- Optional request-level `tests` runs after declarative assertions whenever a response exists. Use global `test(name, callback)` and `expect(actual)` with read-only `noodle.*` readers. Tests may be synchronous or async; callbacks are awaited in declaration-order results. Mutations, network calls and modules are unsupported in tests; external JavaScript source files are supported. See [the schema and matcher reference](../schema.md#inline-scripted-tests).
- Read scripted checks from `data.result.tests` or `data.results[].tests`: `{ evaluated, results, logs, error?, errors?, invocations? }`. Ordered results contain `name`, `passed`, `message`, and `durationMs`; a top-level `error` is separate from callback failures and preserves completed results. Pre/transport failures report `evaluated: false`; requests without tests omit the group. Known secrets are redacted from names, messages, errors, and logs. Human output prints counts and concise failures, without logs.
- Failed callbacks or test-script errors add `test` after `assertion` in the stable failure-category order and make runs fail. Summaries include `testPasses`, `testFailures`, and `testScriptErrors` when test groups exist. Fail-fast waits for all response diagnostics, and successful pre/post/capture writes survive test failures. Manual timeline history retains bounded test diagnostics; automation does not write history.
- Prefer captures for declarative extraction and `scripts.post` for conditional processing, such as `if (noodle.response.status === 201) noodle.run.set("id", noodle.response.json().id)`. Post-response text has a lazy 5 MiB UTF-8 cap; cached JSON stays in the VM and extracted RunScope values retain 256 KiB/depth-32 limits. Cookie access, when available, is final-URL-scoped `get/set/delete`; unknown attributes and domains are rejected, cookies are host-only, and deletion removes all applicable matches. Cookie and RunScope writes commit atomically but cookie durability remains deferred. See [schema](../schema.md#inline-request-scripts) for exact inputs and restrictions.
- Run commands contact remote servers and may write cookie-jar state, bootstrap a `collection_id`, refresh OAuth credentials, and persist declared captures or explicit script environment/secret intents during CLI `request run`. Collection runs suppress both forms of persistence. `persist: environment` updates plaintext and refuses secret downgrades; `persist: secret` stores through the OS vault and can upgrade plaintext. Capture persistence requires the `--env` or settings environment, runs sequentially with partial success, and happens after successful extraction even when HTTP or assertions fail. Script intents use the bounded batch and rollback semantics described above. Run commands do not write response timeline entries or RunScope values into request YAML or collection settings. Execute runs only when the
  user has authorized the request scope, even when the HTTP method is normally
  read-only.
- Windows cookie storage requires a vault-backed encryption key and does not fall back to plaintext. Existing plaintext jars are unavailable until an explicit backup-backed reset; fix vault access before resetting. macOS/Linux retain the warned mode-`0600` fallback.
- Treat cookie `data.warnings` as non-fatal diagnostics. Run results can succeed while warning that cookie storage is plaintext or unavailable; unavailable jars are skipped for that run. `cookie list` also reports `data.state`, warnings, and `hostOnly` for every cookie.
- Cookie jar and encryption-key locks recover automatically only when valid owner metadata identifies a confirmed exited process. Recovery keeps an abandoned-lock backup and preserves cookies and keys. Live or uncertain owners remain locked; do not clear session data to resolve lock contention. Environment transaction locks still require manual investigation.
- Treat every `cookie list` value as sensitive. Do not paste human or JSON output into logs, issues, or shared reports without redaction.
- `cookie clear` is the explicit recovery operation for unreadable cookie storage. It preserves the original file and returns its path in `data.backupPath` before creating a clean jar. Report that backup path to the user.
- Add `--insecure` to `request run` or `collection run` only when the user explicitly authorizes disabling TLS certificate verification for that invocation.
- `secret set` creates or updates the blank `# @secret KEY` declaration and stores the value in the OS vault. Prefer masked TTY input for humans; use `--stdin` only when automation can supply the value without exposing it in arguments or logs. `environment set` refuses declared secret keys.
- `collection audit --fix` writes canonical forms for valid files. Obtain user authorization before running it.

## Collection report files

```bash
noodle collection run ./api --env ci
noodle collection run ./api --env ci --json
noodle collection run ./api --env ci --json --output results.json
noodle collection run ./api --env ci --reporter junit --output results.xml
```

`--output/-o` saves the sanitized collection result. With `--json`, stdout and
the file contain the same compact JSON envelope and trailing newline. With
`--reporter junit`, stdout keeps the existing human result and the file contains
JUnit XML. Human progress uses stderr only when it is a TTY; JSON has no progress
output. Completed-run warnings remain in the result and human output.

The only reporter name is `junit`, and it requires `--output`. Reject
`--json --reporter junit`, an unknown reporter, `--output` without a format, and
invalid or existing destinations before HTTP. These errors use exit `2`, an
error envelope with `data: null` in JSON mode, or `configuration error:` on stderr
in human mode. Relative destinations start at the working directory; `@/` starts
at the home directory. Missing parents are created when saving. Existing files,
directories, and symlinks are never overwritten, including concurrent creations.

Reports are written for successful, failed, cancelled, and pre-run configuration
results when the format and destination are valid. The output directory is pinned before HTTP. Native publication uses a private
sibling staging directory on POSIX and a protected staging file handle on
Windows; only a complete report is published, without replacement. Handled failures
clean up the temporary file; unsupported atomic publication fails without a
partial destination. A hard kill or second interruption can prevent reporting
and leave a temporary file, but cannot publish a partial report.

A report-write failure leaves execution diagnostics intact. JSON emits one
envelope with `status: "error"` and an appended `Unable to write collection report`
message; `data.failed` still describes execution. Human mode keeps the normal
result on stdout and emits the write error on stderr. A successful run becomes
exit `1`; an already nonzero code, including `2` or `130`, is preserved. Report
serialization and writing are excluded from runner timings.

### JSON automation contract

The envelope always has `status: "success" | "error"`, `data`, and `errors: string[]`.
Success uses `errors: []`; ordinary completed failures retain `["command failed"]`.
Configuration failures use their diagnostic message, and cancellation uses
`["Collection run cancelled"]`. `data` is the collection result below, or `null`
when command validation/unexpected failure prevents producing that result.
Error strings are diagnostics, not identifiers to parse.

Fields marked optional are omitted when unavailable, not filled with `null`.
Values explicitly described as JSON values can themselves be `null`. Object key
order is not significant. Numeric durations are milliseconds unless stated
otherwise and need not be integers. Arrays have the ordering specified below.

| Collection result field | Type and meaning |
| --- | --- |
| `results` | Ordered array of started top-level request executions, including an interrupted execution. Child requests remain in script diagnostics. |
| `skipped` | Ordered array of unstarted selected executions: `{ id: string, reason: "fail-fast" \| "cancelled" \| "setup-failed", iteration?: number, stage?: "setup" \| "main" \| "teardown" }`. |
| `failed` | Boolean; true for execution failure, configuration failure, or cancellation. Independent of report-write failure. |
| `failure` | Optional `{ category: "configuration", message: string }` for failure before execution. `results` and `skipped` are empty, even if a selection count is known. |
| `cancelled` | Optional literal `true` when the run was cancelled; absent otherwise. |
| `iterations` | Optional dataset row count, present for data-driven runs that reach execution preparation. Row data is never included. |
| `summary` | Required counters and aggregate timing, described below. |
| `warnings` | Optional array of non-fatal diagnostic strings. |

Within each dataset row, the order is setup, selected main requests in collection
order, then teardown. Each array preserves its own execution/skip order; they are
not one combined timeline. Results and skips are identified by `(id, iteration,
stage)`. `iteration` is zero-based and absent without `--data`. `stage` is present
for all selected stages when hooks exist, and absent for hook-free runs. Filtering
excludes requests from both arrays. Setup failure skips that row's mains while
attempting teardown; fail-fast prevents later rows. Cancellation starts no cleanup.

| Request result field | Type and meaning |
| --- | --- |
| `id`, `method`, `url` | Required strings: collection-relative ID without `.yml`, HTTP method, and sanitized prepared URL when preparation succeeded (otherwise original URL). |
| `ok` | Required boolean; false for failure or cancellation. |
| `failureCategories` | Required ordered array of categories below; cancellation itself adds no category. Earlier completed failures can remain on a cancelled result. |
| `durationMs` | Optional non-negative number; emitted for each current collection execution, including pre-script/transport failures and cancellation. Measures the entire request lifecycle, excluding inter-request delay. Absent in older results and single `request run` results. |
| `iteration`, `stage`, `cancelled` | Optional identity and cancellation fields as described above; `cancelled` is literal `true`. |
| `response` | Optional completed HTTP response, retained even if a later phase fails or is cancelled. |
| `error` | Optional sanitized diagnostic string for execution/transport errors or cancellation. |
| `warnings` | Optional string array of request warnings. |
| `scripts`, `captures`, `assertions`, `tests` | Optional execution groups, described below. |

`response` requires `status: number`, `statusText: string`,
`headers: Record<string, string>`, and `timeMs: number` (HTTP duration, not complete
lifecycle duration). Text responses have sanitized `body: string`. Binary
responses omit `body` and expose `bodyKind: "binary"`, `size: number`,
`contentType: string`, and optional `filename: string`. No binary bytes/base64 are
included. Optional `cookies` contains `{ name, value, expires, secure, httpOnly }`,
optional string `domain` and `path`, and optional `sameSite: "strict" | "lax" | "none"`.
Cookie `value` is masked, `expires` is a string or `null`, and the flags are booleans.
The shared response type also has optional `outputFile: string` for single-request
body downloads; collection report paths are not added to response metadata.

Execution groups require `evaluated: boolean` and ordered `results` arrays. An
absent group means no applicable enabled declaration; `evaluated: false` with
empty results means applicable work was not evaluated. A partially cancelled
group can retain completed results. No outcomes are invented for unexecuted
blocks. Disabled assertions/captures do not produce rows.

- `assertions.results`: `{ expression: string, operator: string, expected?: JsonValue, actual?: JsonValue, passed: boolean, message: string }`. Declaration order; absent actual/expected differs from explicit JSON `null`. Operators follow the [assertion schema](../schema.md).
- `captures.results`: success rows have `{ variable: string, expression: string, success: true, type: "null" | "boolean" | "number" | "string" | "array" | "object", value: JsonValue, persisted?: "secret" | "environment" }`. Failure rows instead have `success: false`, `failureReason: "missing" | "resolution_error" | "persistence_error"`, and `message: string`. Collection runs never persist captures. Rows retain declaration order.
- `scripts.results`: ordered pre then post invocations, each in collection, outer-folder, inner-folder, request order. Fields: `phase: "pre" | "post" | "tests"`, `scope: "collection" | "folder" | "request"`, `sourceKind: "inline" | "external"`, `success: boolean`, `durationMs: number`, `logs: Log[]`, optional `source: Source`, `error: ScriptError`, `cancelled: true`, `persistence: PersistenceOutcome[]`, and `requests: ChildRequest[]`.
- `tests`: also requires `logs: Log[]`; each result has `{ name: string, passed: boolean, message: string, durationMs: number, source?: Source }` in declaration order across inherited blocks. Optional `invocations` uses the script invocation shape, including blocks declaring zero tests. Optional `errors: ScriptError[]` retains every block error; legacy `error: ScriptError` remains the first. Optional `cancelled: true` identifies interruption. Callback failures are rows; top-level errors are block errors.
- `Source`: `{ scope: "collection" | "folder" | "request", path: string, scopeId?: string, sourceKind?: "inline" | "external", sourcePath?: string }`. `path` names the declaring YAML file; external `sourcePath` is collection-relative. No source code is included.
- `ScriptError`: `{ name: string, message: string, source?: Source, line?: number, column?: number }`. Locations are available when the runtime can identify them.
- `Log`: `{ level: "log" | "info" | "warn" | "error", message: string, source?: Source, timeMs?: number }`. Arrays preserve emission order. Relative timing is optional; bounds can replace text with `[TRUNCATED]`.
- `PersistenceOutcome`: `{ variable: string, operation: "set" | "unset", target: "environment" | "secret", status: "saved" | "transient" | "failed", error?: ScriptError }`. Collection runs suppress persistence and report transient outcomes; values/intents are not exposed.
- `ChildRequest`: `{ kind: "saved" | "http", requestId?: string, depth: number, method: string, url: string, status?: number, durationMs: number, success: boolean, failureCategories: string[], error?: ScriptError, cancelled?: true }`. Ordered child summaries contain sanitized metadata, not bodies.

`summary` always contains non-negative integer counts `selected`, `executed`,
`completed`, `cancelled`, `unstarted`, `skipped`, `requestSuccesses`,
`requestFailures`, `assertionPasses`, `assertionFailures`, and `captureFailures`;
`durationMs` is the rounded wall duration including preparation, waits and cleanup.
`failureCategories` is the ordered union of result categories, plus configuration
when applicable. Optional `testPasses`, `testFailures`, and `testScriptErrors`
appear together when at least one test group exists. Optional `stages` maps
`setup`, `main`, and `teardown` to `{ executed, passed, failed, skipped, cancelled }`
counts when stage rows exist.

Accounting: `selected = completed + cancelled + unstarted`,
`executed = completed + cancelled`, and
`completed = requestSuccesses + requestFailures`. Cancelled executions are not
request failures. Assertion/capture/test counters retain completed diagnostics,
including those from an interrupted execution. Normally `skipped = unstarted`;
pre-run configuration failure may know selected/unstarted counts without having
skip rows. Stage counts count hook executions, not inherited script blocks.

| Failure category, in fixed order | Meaning |
| --- | --- |
| `configuration` | Pre-run collection, selection, data, environment, transport-policy or external-source validation failure. |
| `execution` | Request preparation/substitution or other request execution failure. |
| `script` | Failed pre/post invocation or persistence operation. |
| `transport` | Failed HTTP transport, network-safety refusal or request timeout. |
| `http` | HTTP status at least 400, even if assertions pass. |
| `capture` | Failed response capture. |
| `assertion` | Failed declarative response assertion. |
| `test` | Failed test callback or test-block error. |

Categories can coexist; do not infer outcome from HTTP status alone. Explicit
cancellation retains partial response phases and rolls back unfinished script
writes; it is not a timeout or a new failure category.

| Exit code | Meaning |
| --- | --- |
| `0` | Successful run and requested report saved. |
| `1` | Completed request failure, unexpected execution failure, or report-write failure after an otherwise successful run. |
| `2` | Pre-run configuration failure or invalid report options/destination. |
| `130` | Graceful SIGINT/SIGTERM cancellation; a second signal forces immediate exit. |

This contract applies after entering the command handler. CLI-parser usage
errors (for example, missing required positional arguments) retain the existing
parser diagnostics and exit behavior rather than returning a result envelope.
Reports cannot be guaranteed after force termination.

Known secrets, ordinary JSON-escaped secret strings, credential headers, and
cookie values are redacted in the shared result before reporting. Unknown server
content and deliberately transformed secrets can remain visible. JSON retains
sanitized response bodies; treat artifacts according to their contents.

Patch releases preserve existing field types, meanings and omission behavior.
New optional fields may be added; readers must tolerate unknown fields and handle
unknown future category values conservatively. Breaking contract changes require
an explicitly documented version boundary, not a silent patch. Diagnostic text,
human formatting, timing values and JSON object-key order are not parsing APIs.
No schema version field or reporter-specific JSON wrapper is introduced.

### JUnit mapping

The XML contains one `testsuites` root and one `testsuite`. Each selected
execution has one `testcase` named with its ID and, when present, one-based
iteration and stage; classname is `noodle.collection`. Assertions and scripted
tests are diagnostics within that case, not additional cases. Cases follow row,
stage and collection order. Filtered requests are omitted.

- Passed execution: no outcome child.
- HTTP, capture, assertion or test callback failure: one `failure` child.
- Configuration, execution, pre/post script, transport or top-level test-block error: one `error` child. Errors take precedence when categories coexist; all diagnostics remain in that child.
- Unstarted execution: `skipped` with `fail-fast`, `setup-failed` or `cancelled`.
- Interrupted execution: `skipped` with `cancelled`; completed failure diagnostics remain in `system-err`, logs in `system-out`. The suite also records the cancellation property, including cancellation before HTTP.
- Pre-run configuration failure: one synthetic `Collection configuration` error case, without inventing request executions. A successful empty selection produces zero cases.

Counts come from emitted cases and are mutually exclusive. Times are seconds:
complete lifecycle duration per execution, zero for unstarted cases, and total
runner wall duration for the suite/root. Suite time includes waits/preparation
and need not equal the sum of case times. Older results without `durationMs`
fall back to HTTP duration or zero. A synthetic configuration case has zero time.

The reporter uses sanitized messages, source origins, expected/actual assertion
values and bounded logs. It excludes response bodies, headers, full capture
values and datasets. XML text/attributes are escaped and invalid XML 1.0 code
points become U+FFFD. JUnit skipped counts include interrupted executions, unlike
JSON `summary.skipped`, which counts only unstarted skip rows. The process exit
code remains authoritative for CI failure/cancellation.

### GitHub Actions artifact upload

After checking out a repository containing the `./api` collection and its `ci`
environment, install the exact CLI release with
[`setup-noodle`](https://github.com/noodle-rest/setup-noodle). The action verifies
the binary checksum and adds Noodle to PATH for the following steps.

```yaml
- uses: noodle-rest/setup-noodle@v1
  with:
    version: v0.10.4

- name: Run API tests
  run: noodle collection run ./api --env ci --reporter junit --output results.xml

- name: Upload API report
  if: ${{ always() }}
  uses: actions/upload-artifact@v7
  with:
    name: api-results
    path: results.xml
    if-no-files-found: error
```

The API test step retains its failure status. `always()` allows the artifact step
to run after failure or cancellation; no `continue-on-error` is needed. Use a fresh
report path for each invocation. See [upload-artifact](https://github.com/actions/upload-artifact)
and [GitHub status checks](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#always).

## Fall back to files

Use direct YAML/dotenv/JavaScript edits when the CLI cannot express the change: folders and inheritance, request headers, params, auth, bodies, form data, inline or external pre/post scripts and tests, captures, assertions, new environment files, and manual conversions. After edits, run `noodle collection audit <dir> --json` and, when appropriate, execute the affected request sequence.


## Inherited scripts and tests

Declare `scripts.pre`, `scripts.post`, and `tests` in collection `settings.yml`,
nested `folder.yml`, or request YAML. Each field accepts one inline JavaScript
string or a collection-relative external reference such as `./scripts/sign.js`.
Empty strings are no-ops and are omitted by canonical serialization.

For every request: collection pre → folder pre (outermost to nearest) → request
pre → HTTP → captures → collection post → folder post (outermost to nearest) →
request post → assertions → tests (collection, outer folders, inner folders,
request). Collection and folder hooks run once per request, including each selected
request and dataset row. Ancestors use file paths, not display names; root
`folder.yml` remains ignored. Existing inherited tests remain supported.
The most specific successful post write wins, including persisted writes.

Every block has a fresh QuickJS invocation. JavaScript locals are isolated;
successful RunScope writes are visible to later blocks. A pre failure stops
remaining pre blocks and HTTP. A post failure rolls back only that block and
continues later posts, assertions, and tests. A top-level test error stops only
its block. Successful persistence intents keep execution order; collection
runs and F5 suppress persistence as before. Saved `noodle.runRequest()` calls
use the same inheritance and cycle protections.

Every executed block identifies its phase, scope, scope ID, source kind, duration,
logs, and normalized error. `source.path` remains the declaring YAML path;
`source.scopeId` identifies the collection, folder path, or request ID;
`source.sourceKind` is `inline` or `external`, and external blocks add
`source.sourcePath`, such as `./scripts/sign.js`. Test groups retain ordered
`invocations` even for files declaring zero tests, and `errors` with legacy
first `error` compatibility. JSON and live Results retain bounded redacted logs.
New history entries retain bounded, redacted outcome summaries and script/test
logs, excluding source code and RunScope values. Existing history remains readable.

Inherited blocks share a 64 KiB console-text budget and a 256 KiB test-record
budget per request. Logs become `[TRUNCATED]` at the limit; exhausted test
records produce a test script error, and later blocks are still invoked.


## CSV and JSON iteration data

```bash
noodle collection run ./my-api --data ./data/users.csv
noodle collection run ./my-api users/ --data ./data/users.json --tag smoke --delay 100 --fail-fast --json
```

`--data` is optional and independent of the `--json` output flag. In F5, enter
the optional **Data file** path, check the iteration count, and select **Run**.
Relative CLI paths start at the current directory; relative F5 paths start at
the collection root. Both accept absolute paths. F5 revalidates at run start.
Humans can inspect completed responses, Results, and Console while later requests run. Stop with `s`, click, or focused Enter/Space; Escape leaves the workspace and F5 resumes it. Execution-affecting edits remain locked until cancellation and cleanup settle. The latest settled run per collection stays in memory across reloads and collection switches until app exit, including its executed configuration and selected iteration/result. Configuration edits and preflight failures preserve it; a later settled run replaces it. In settled details, `o` opens the request or selected result's source, with a searchable picker for multiple test origins; F5 returns to results. Text body previews stop at 10,000 UTF-8 bytes, omitted details show a notice, and binary bodies remain metadata-only. No disk history is added.

CSV uses a header row as variable names and keeps cells as strings, including
quoted commas and multiline fields; a UTF-8 BOM is accepted. JSON requires a
non-empty array of objects and preserves JSON value types:

```json
[{ "user_id": 1, "active": true }, { "user_id": 2, "active": false }]
```

The entire file is validated before requests are sent. Empty files, invalid or
unsafe variable names, duplicate CSV headers, and inconsistent CSV rows fail.
Names use letters, digits, or underscores. Limits are 5 MiB per file, 1,000
rows, and 10,000 request executions, including configured hooks for each row.
Rows must fit the existing 256 KiB/depth-32 bridge limits, including the iteration
wrapper.

Each row runs every selected request in collection order. Its variables
override environment values for `$name` substitution and `noodle.run.get`;
successful captures and scripts can replace them during that iteration.
`noodle.env.get` continues to read the original environment snapshot.
`noodle.iteration` is deeply read-only `{ index, count, data }`, with zero-based
`index` and the original row in `data`. It is `null` without data and is shared
with child requests. JavaScript objects in `data` retain their JSON types.

Each row starts with fresh variables and an in-memory copy of the same initial
cookie jar. Cookies change within that row only and are never persisted.
Fail-fast skips remaining main requests and later rows, but still attempts
the started row's teardown unless cancelled. Delay applies between all
consecutive executions, including row boundaries. Results, skips, and details
carry zero-based `iteration`; the collection result adds `iterations`. F5 groups
results by iteration and counts progress across all executions. Human labels
show iteration numbers starting at one. Datasets themselves are not included
in results or history.

Exit codes are `0` for success, `1` for execution/response validation failure,
`2` for configuration or invalid data, and `130` for collection cancellation.
Without `--data`, each selected request runs once.
