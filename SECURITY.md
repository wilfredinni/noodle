# Security

## Threat Model

Noodle is a local terminal HTTP client. It runs on your machine and sends HTTP requests that you configure. It stores collections, environments, and configuration on your local filesystem.

### What noodle does

- Sends real HTTP requests over your network
- Substitutes `$VARIABLE` values from local `.env` files
- Stores request definitions as YAML files on disk
- Stores environment variables as dotenv files under `<collection>/.environments/`

### No sandbox

Noodle does not sandbox requests. It executes the requests you define. The substitution system uses environment values as-is, while request URLs and collection settings are validated at their execution boundaries.

Redirects are restricted to HTTP and HTTPS. HTTPS-to-HTTP downgrades are blocked, and credential-bearing headers are stripped on cross-origin redirects.

### Credential handling

Environment files (`.env`) under `.environments/` may contain API keys, tokens, and secrets. These files live on disk alongside your collections. Noodle does not encrypt them, transmit them separately, or log them (except in the timeline, which is local). Treat `.environments/` directories like any local secrets store.

Encrypted mTLS private-key passphrases must be referenced from an environment as an exact `$VARNAME`; literal passphrases are rejected in collection settings.

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
