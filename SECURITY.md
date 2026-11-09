# Security

## Threat Model

Noodle is a local terminal HTTP client. It runs on your machine and sends HTTP requests that you configure. It stores collections, environments, and configuration on your local filesystem.

### What noodle does

- Sends real HTTP requests over your network
- Substitutes `$VARIABLE` values from local `.env` files
- Stores request definitions as YAML files on disk
- Stores ordinary environment variables as dotenv files under `<collection>/.environments/`
- Stores declared environment secrets, proxy credentials, and encrypted mTLS key passphrases in the operating system credential vault

### Trusted collections and real network access

Treat collections as trusted code and configuration. Review requests, inherited
collection/folder scripts and tests, external `.js` sources, setup/teardown hooks,
upload paths, and destinations before running a collection from someone else.
Requests can contact local/private services and send credentials or files you
make available. Noodle does not provide a network isolation boundary or a
per-destination permission prompt. Validation and script isolation do not make
an untrusted collection safe to execute.

Environment values are substituted into request fields as data, not JavaScript
source; script source is not substituted. A script can nevertheless read selected
environment secrets through `noodle.env.get` and send them elsewhere through the
supported request APIs. Redaction protects some outputs, not outbound data.

### QuickJS capabilities and limits

Each script/test block runs in a fresh QuickJS runtime with a frozen,
null-prototype `noodle` namespace. It cannot directly access Bun/Node, the shell,
filesystem, imports/require, raw `fetch`, timers, or background workers. Pre/post
scripts can await `noodle.runRequest` and `noodle.sendRequest` through the host's
HTTP lifecycle. Saved children use their own auth; direct requests do not inherit
parent credentials. Tests can await callbacks but cannot use these network APIs
or mutate request, RunScope, or cookie state.

Current per-invocation limits include a 500 ms VM execution budget (excluding
network waits), a 30-second wall deadline bounded by ancestors, 32 MiB runtime
memory, 512 KiB stack, and 256 KiB source/ordinary bridge values. WASM memory is
fixed at 64 MiB. Lazy response text has a separate 5 MiB UTF-8 cap. Chaining permits
one outstanding call per script, ten calls per top-level request, and four child
levels. Console output and diagnostics are bounded. These limits reduce resource
abuse; they are not an OS process sandbox or a guarantee against engine defects.
See the [capabilities and full limits](https://noodlerest.dev/docs/reference/script-api/#sandbox-limits).

External source references must be collection-relative `./…/*.js` paths. The
host resolves real paths, rejects escapes/non-regular files, and checks UTF-8 and
size before passing source text into QuickJS. Applicable sources are resolved
before execution; collection runs preflight all selected sources before HTTP.
This confines script source loading, not ordinary request upload paths. Do not
execute collections concurrently modified by an untrusted local actor.

### Script writes and persistence

Pre/post RunScope writes are transient unless explicit persistence is requested.
Manual sends and `request run` honor `noodle.run.set/unset` with
`{ persist: "environment" | "secret" }` and capture persistence. Successful pre
intents persist before HTTP; captures persist their original values before post
intents. Collection runs and the TUI Runner suppress these persistence intents;
saved child requests also suppress their own persistence. This does not disable
HTTP side effects or ordinary cookie-jar persistence.

A failed invocation rolls back its staged variables and script cookie edits;
earlier successful blocks, HTTP side effects, and received cookies survive.
Storage errors fail diagnostics but preserve successful runtime changes.
Environment/vault mutations coordinate under one cross-process directory lock
with rollback on storage failure. An interrupted writer can require recovery:
never remove `.environments/.mutation.lock` while a writer may be active. See
[persistence semantics](https://noodlerest.dev/docs/guides/pre-request-scripting/#save-environment-and-secret-values)
for limits and failure behavior.

### Redirects and transport policy

Only HTTP/HTTPS redirects are accepted; HTTPS-to-HTTP downgrades are blocked.
Cross-origin redirects strip sensitive headers and headers containing known
secrets, and stop forwarding the original authentication. A redirect that would
preserve a body containing a known secret is refused; a redirect that discards
that body may proceed. Body checks match literal text and form field names/values
(including uploaded filenames), not the contents of binary or multipart file
uploads or every encoded representation. Some credential-bearing authentication
flows refuse cross-origin redirects entirely. Cookies are selected for each
destination.

These checks are not general data-loss prevention: unknown or transformed
secrets and user-selected destinations remain the collection author's
responsibility. TLS verification is enabled by default; `--insecure` or saved
TLS overrides can disable it. Prefer a configured CA and exact-host client
certificate profiles. See [transport settings](https://noodlerest.dev/docs/guides/settings/).

### Credential handling

Ordinary environment values remain plaintext in `.env` files. Declare a secure value with `# @secret NAME` followed by a blank `NAME=` placeholder, then set it from the environment editor or `noodle secret set`. Noodle stores the value in macOS Keychain, Linux Secret Service, or Windows Credential Manager; a same-named process environment value takes precedence.

On headless Linux, Secret Service requires a running user D-Bus session and an
unlocked GNOME Keyring or KWallet collection. If Noodle reports that
`/org/freedesktop/secrets/collection/login` does not exist, initialize or unlock
the login keyring before storing secrets. For unattended automation, use the
same-named process environment variable or an external secret manager instead
of relying on an interactively unlocked keyring. See the [Linux secret storage
setup](https://noodlerest.dev/docs/reference/environment-format/#linux-and-headless-environments)
guide.

Custom proxy URLs cannot contain credentials or variables. Proxy usernames and passwords, plus encrypted mTLS private-key passphrases, are entered through Settings and stored in the OS credential vault. Configuration files retain only non-secret metadata.

OAuth tokens use the OS vault with a session-only memory fallback. Cookie jars
use vault-backed encryption; macOS/Linux can fall back to plaintext with `0600`
permissions and a warning when the vault is unavailable. Windows rejects that
plaintext fallback. Dataset runs use transient per-row cookie copies.

### History, reports, and explicit exports

New timeline entries redact known secrets in request/response text, headers,
assertions, script/test logs and errors, and network messages. Sensitive headers
are masked by field; body redaction precedes compression into sidecars. Binary
history retains metadata only. Script source, RunScope values, capture results,
and child response bodies are not stored as separate history fields. They may
still appear in user-written logs or payloads subject to known-secret redaction.
Changing secret declarations does not rewrite old entries. See the
[timeline reference](https://noodlerest.dev/docs/reference/timeline/#security).

JSON request/collection results and JSON/JUnit collection reports use sanitized
shared results. JSON includes sanitized text bodies and capture/assertion values;
JUnit includes diagnostic messages, failed assertion values, warnings, and
script/test logs rather than a dedicated response-body field. Failed/cancelled
runs can still write reports. See the existing
[report contract](.agents/skills/noodle-use/workflows/automation.md#collection-report-files).

Redaction recognizes registered secret values (including ordinary JSON-escaped
strings) and sensitive fields; it cannot discover arbitrary server secrets or
every encoding/transformation. Ordinary environment values are not automatically
secret. Short cookie/primitive values have conservative matching rules to avoid
masking unrelated diagnostics. Treat history, sidecars, reports, and CI artifacts
as potentially sensitive; do not commit `.timeline/` or publish reports blindly.

The live response remains inspectable. `request run --output` and TUI Save As
write original, unredacted response bytes. `cookie list` exposes cookie values.
Collection exports preserve literal request values and can disclose local file
paths; environment redaction does not remove hardcoded credentials from request
definitions. Review downloads, exports, copied output, and generated code before
sharing them.

### Windows support

Windows x64 remains **beta**. Releases include an unsigned executable and
SHA-256 checksums; Windows ARM64 is unsupported. CI validates Windows execution,
but ordinary-account interactive terminal validation remains pending. Neither
checksums nor passing CI establish antivirus acceptance or publisher identity.

As of 2026-11-08, the current published release is
[v0.10.4](https://github.com/noodle-rest/noodle/releases/tag/v0.10.4).
Its [Windows test job](https://github.com/noodle-rest/noodle/actions/runs/42148815536/job/127666734573)
and [downloaded release artifact verification](https://github.com/noodle-rest/noodle/actions/runs/42150087253/job/127671293567)
passed. The latter checks checksum/version, compiled scripting, and binary-response
integration; it is not a recorded Defender scan or an interactive-user test.

[Issue #279](https://github.com/noodle-rest/noodle/issues/279) reports Defender
blocking **v0.10.1** on Windows 11 build 10.0.26200. Attached screenshots identify
`Trojan:Win32/Ulthar.A!ml`, a blocked download and a quarantined executable, with
security intelligence `1.461.144.0`, client `4.18.26090.9`, and engine `1.1.26090.9`.
They establish the reported detection, not whether the executable was malicious
or a false positive; the screenshots do not provide a file hash, so the version
attribution follows the reporter. No Microsoft determination or current-release Defender
reproduction is recorded in that discussion. Detection of the v0.10.4 asset
under current Defender definitions and ordinary-user terminal behavior remain
unverified in this pass. Keep the issue open and beta status until evidence
supports changing them; do not bypass antivirus protection to validate a build.

### Out of scope

| Category | Rationale |
|----------|-----------|
| Server-side vulnerabilities on tested endpoints | Noodle is the client; the target API is not in our trust boundary |
| Data sent to external APIs | You configure the URLs and credentials. It is your responsibility. |
| Secrets committed to version control | Noodle stores collections as files; git hygiene is the user's responsibility |
| Supply chain attacks via npm dependencies | Standard open-source risk; audit your own supply chain |
| Script injection via environment variable values | Env values are substituted into request fields as plain text |

---

## Reporting Security Issues

We appreciate responsible disclosure. To report a security issue, use the GitHub Security Advisory ["Report a Vulnerability"](https://github.com/noodle-rest/noodle/security/advisories/new) tab.

Include:
- A clear description of the issue
- Steps to reproduce
- Affected version(s)
- Any relevant configuration or environment details

You will receive a response within 5 business days. We will keep you informed of progress toward a fix.

### No AI-generated reports

We do not accept AI-generated security reports. Reports that are clearly AI-generated will be closed as invalid.

### Escalation

If you do not receive an acknowledgement within 5 business days, open a public issue referencing your advisory.
