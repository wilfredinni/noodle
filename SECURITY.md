# Security

## Threat Model

Noodle is a local terminal HTTP client. It runs on your machine and sends HTTP requests that you configure. It stores collections, environments, and configuration on your local filesystem.

### What noodle does

- Sends real HTTP requests over your network
- Substitutes `$VARIABLE` values from local `.env` files
- Stores request definitions as YAML files on disk
- Stores ordinary environment variables as dotenv files under `<collection>/.environments/`
- Stores declared environment secrets, proxy credentials, and encrypted mTLS key passphrases in the operating system credential vault

### No sandbox

Noodle does not sandbox requests. It executes the requests you define. The substitution system uses environment values as-is, while request URLs and collection settings are validated at their execution boundaries.

Redirects are restricted to HTTP and HTTPS. HTTPS-to-HTTP downgrades are blocked, and credential-bearing headers are stripped on cross-origin redirects.

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

Persisted timeline request snapshots redact declared environment secrets, sensitive header values, proxy credentials, and mTLS passphrases. Server response headers and bodies are retained exactly as received, and ordinary environment values are not treated as secrets. Timeline files and compressed body sidecars can therefore still contain sensitive payloads; do not commit `.timeline/`.

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

We appreciate responsible disclosure. To report a security issue, use the GitHub Security Advisory ["Report a Vulnerability"](https://github.com/wilfredinni/noodle/security/advisories/new) tab.

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
