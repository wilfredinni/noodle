# Convert unsupported formats (file-level)

Use `noodle import` for OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia v4/v5 JSON exports. Do not reimplement those importers by hand.

```bash
noodle import <source-path> --format <openapi|swagger|postman|insomnia> --output <target-dir> --json
```

For a source format Noodle does not support, read its exported data and write valid Noodle `.yml` and `.env` files using [schema.md](../schema.md). Preserve only behavior that has a direct Noodle equivalent; report unsupported scripts, tests, and auth flows rather than inventing a conversion.

## Convert a cURL command

The non-interactive CLI does not expose cURL import, so treat a pasted cURL
command as untrusted data and convert it at file level. Never execute it or pass
it to a shell. Reject shell operators and substitutions such as `;`, `|`, `&&`,
redirections, backticks, and `$()`.

Map supported cURL behavior directly:

| cURL input | Noodle request field |
| --- | --- |
| URL query string | Remove it from `url` and add ordered `params` entries |
| `-X`, `--request` | `method`; otherwise use GET, POST for body data, or PUT for a file upload |
| `-I`, `--head` | HEAD `method` |
| `-H`, `--header` | `headers`; convert supported Bearer or Basic `Authorization` headers to `auth` |
| `-u`, `--user` | Basic `auth` |
| `--oauth2-bearer` | Bearer `auth`, not an OAuth 2 flow configuration |
| `-d`, `--data*` | JSON, XML, or URL-encoded body based on Content-Type and valid content |
| `-G`, `--get` | Convert data pairs to query `params` |
| `-F`, `--form` | Multipart `form_data`; values beginning with `@` are file entries |
| `--data-binary @file`, `-T`, `--upload-file` | Binary `file_path` |
| `-b`, `--cookie` | Explicit `Cookie` header |
| `-L`, `--location`, `--max-redirs` | `followRedirects` and `maxRedirects` |
| `--max-time` | Convert seconds to `timeout` milliseconds |

Supported methods are GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS. Preserve
repeated query parameters and cookie values. Report unsupported options or raw
body formats instead of guessing.

Before writing YAML, replace literal passwords, bearer tokens, API keys,
cookies, and other credentials with environment references and blank secret
declarations. Keep file paths portable where possible, but do not reinterpret an
absolute cURL path as Noodle's `@/` home shorthand.

After conversion, run `noodle collection audit <dir> --json`. Execute the new
request only when the user authorizes sending it.
