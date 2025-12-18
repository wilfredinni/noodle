# Project Dependencies

## Overview

This project utilizes [uv](https://docs.astral.sh/uv/) as its dependency management tool. uv is an extremely fast Python package installer and resolver written in Rust by Astral (creators of Ruff). It ensures consistent project environments by managing dependencies, virtual environments, and packaging with 10-100x faster performance than traditional tools. All project dependencies are defined in the `pyproject.toml` file, categorized into main dependencies and development-specific dependencies.

## Main Dependencies

The following are the primary dependencies required for the application to run in production:

*   **`python`**: Specifies the compatible Python version. **Version:** `^3.13`
*   **`django`**: The web framework for perfectionists with deadlines. **Version:** `^5.1.2`
*   **`django-environ`**: Manages environment variables for Django settings. **Version:** `^0.12.0`
*   **`django-cors-headers`**: Handles Cross-Origin Resource Sharing (CORS) headers. **Version:** `^4.5.0`
*   **`djangorestframework`**: A powerful and flexible toolkit for building Web APIs. **Version:** `^3.15.2`
*   **`psycopg2`**: PostgreSQL adapter for Python. **Version:** `^2.9.10`
*   **`whitenoise`**: Serves static files efficiently in production. **Version:** `^6.7.0`
*   **`gunicorn`**: A Python WSGI HTTP Server for UNIX. **Version:** `^23.0.0`
*   **`django-rest-knox`**: Token-based authentication for Django REST Framework. **Version:** `^5.0.2`
*   **`redis`**: Python client for Redis. **Version:** `^6.0.0`
*   **`celery`**: Distributed task queue. **Version:** `^5.4.0`
*   **`django-celery-beat`**: A periodic task scheduler for Celery. **Version:** `^2.7.0`
*   **`django-celery-results`**: Stores Celery task results in Django models. **Version:** `^2.5.1`
*   **`sentry-sdk`**: Official Sentry SDK for Python, with Django integration. **Version:** `^2.17.0`
*   **`django-redis`**: Full-featured Redis cache backend for Django. **Version:** `^6.0.0`
*   **`drf-spectacular`**: OpenAPI 3 schema generation for Django REST Framework. **Version:** `^0.28.0`
*   **`faker`**: Generates fake data for testing and development. **Version:** `^37.1.0`
*   **`django-seed`**: Populates Django database with random data. **Version:** `^0.3.1`
*   **`django-extensions`**: A collection of custom extensions for Django. **Version:** `^4.1`
*   **`django-filter`**: Reusable Django application for filtering querysets. **Version:** `^25.1`
*   **`python-json-logger`**: A JSON formatter for Python logging. **Version:** `^3.3.0`


## Development Dependencies

- **django-debug-toolbar**: ^5.0.0
- **pytest**: ^8.3.3
- **pytest-django**: ^4.9.0
- **ipykernel**: ^6.29.5
- **pytest-mock**: ^3.14.0
- **pytest-cov**: ^6.0.0
- **mkdocs**: ^1.6.0
- **mkdocs-material**: ^9.5.26

## Managing Dependencies

You can manage dependencies using the provided `make` shortcuts or directly with `uv`.

### Adding a Dependency

To add a new package to the project:

**Using Make:**
```bash
make add-dep pkg=package_name
```

**Using uv:**
```bash
uv add package_name
```

Both methods will:
1. Add the package to `pyproject.toml`
2. Update `uv.lock`

### Removing a Dependency

To remove a package from the project:

**Using Make:**
```bash
make remove-dep pkg=package_name
```

**Using uv:**
```bash
uv remove package_name
```

Both methods will:
1. Remove the package from `pyproject.toml`
2. Update `uv.lock`

### Updating Dependencies

To update all dependencies to their latest allowed versions (respecting constraints in `pyproject.toml`):

**Using Make:**
```bash
make update-deps
```

**Using uv:**
```bash
uv lock --upgrade
```

Both methods will update `uv.lock` with the latest versions.

### Applying Changes

After any dependency change, you must rebuild the Docker container to install the new packages:

```bash
make rebuild
```
