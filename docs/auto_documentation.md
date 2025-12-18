# API Auto-Documentation

## Overview

This section details the automatic API documentation system implemented in the Django Starter Template, which leverages `drf-spectacular` to generate OpenAPI 3 (Swagger) documentation. This ensures that your API documentation remains synchronized with your codebase, minimizing manual effort and potential inconsistencies.

## What is `drf-spectacular`?

`drf-spectacular` is a powerful library that integrates seamlessly with Django REST Framework to generate a comprehensive OpenAPI schema from your DRF views, serializers, and other components. This schema can then be used to render interactive API documentation (like Swagger UI) or generate client SDKs.

## How it's Used in This Project (Best Practices)

This template follows best practices for `drf-spectacular` integration to provide rich and accurate API documentation.

### 1. Centralized Schema Definitions

Instead of defining all schema details directly within views, this project centralizes reusable schema components (like error responses and common examples) in dedicated `schema.py` files within each app (e.g., `apps/users/schema.py`, `apps/core/schema.py`).

This promotes reusability and keeps your view logic clean. For example, common error responses are defined once and reused across multiple endpoints.

```python
# Example from apps/core/schema.py
from drf_spectacular.utils import OpenApiExample, inline_serializer
from rest_framework import serializers

ErrorResponseSerializer = inline_serializer(
    name="ErrorResponse",
    fields={
        "detail": serializers.CharField(read_only=True),
        "code": serializers.CharField(read_only=True, required=False),
    },
)

UNAUTHORIZED_EXAMPLES = [
    OpenApiExample(
        "Unauthorized",
        value={"detail": "Authentication credentials were not provided."},
        status_codes=["401"],
    ),
    # ... other examples
]
```

### 2. `extend_schema` Decorator for Views

The `extend_schema` decorator is used on API views to provide additional metadata that `drf-spectacular` cannot infer automatically. This includes:

*   **Responses**: Defining expected success and error responses, often referencing the centralized schema definitions.
*   **Request Bodies**: Specifying the structure of request payloads.
*   **Parameters**: Documenting query parameters, path parameters, and headers.
*   **Description**: Adding human-readable descriptions for endpoints.

**Example (from `apps/users/views.py` for LoginView):**

```python
from drf_spectacular.utils import extend_schema
# ... other imports

@extend_schema(responses=LOGIN_RESPONSE_SCHEMA)
class LoginView(KnoxLoginView):
    # ... view implementation
```

Here, `LOGIN_RESPONSE_SCHEMA` is imported from `apps/users/schema.py`, ensuring consistency and reusability.

### 3. `SPECTACULAR_SETTINGS` in `conf/settings.py`

Global settings for `drf-spectacular` are configured in `conf/settings.py` under the `SPECTACULAR_SETTINGS` dictionary. This includes basic API metadata like title, description, and version.

```python
# Example from conf/settings.py
SPECTACULAR_SETTINGS = {
    "TITLE": "Django Starter Template",
    "DESCRIPTION": "A comprehensive starting point for your new API with Django and DRF",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}
```

### 4. Interactive Swagger UI

The generated OpenAPI schema is served via Swagger UI, providing an interactive and user-friendly interface to explore and test the API. You can access it at:

`/api/schema/swagger-ui/`

This endpoint is configured in `conf/urls.py`:

```python
# Example from conf/urls.py
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    # ... other urls
]

if settings.DEBUG:
    urlpatterns += [
        path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
        path(
            "api/schema/swagger-ui/",
            SpectacularSwaggerView.as_view(url_name="schema"),
            name="swagger-ui",
        ),
    ]
```

By following these practices, the project ensures that its API documentation is robust, maintainable, and automatically generated, reflecting the true state of the API.
