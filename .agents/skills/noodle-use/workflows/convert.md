# Convert unsupported formats (file-level)

Use `noodle import` for OpenAPI 3.0, Swagger 2.0, Postman, and Insomnia v4/v5 JSON exports. Do not reimplement those importers by hand.

```bash
noodle import <source-path> --format <openapi|swagger|postman|insomnia> --output <target-dir> --json
```

For a source format Noodle does not support, read its exported data and write valid Noodle `.yml` and `.env` files using [schema.md](../schema.md). Preserve only behavior that has a direct Noodle equivalent; report unsupported scripts, tests, and auth flows rather than inventing a conversion.
