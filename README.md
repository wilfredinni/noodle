<div align="center">
    <img src="https://raw.githubusercontent.com/wilfredinni/django-starter-template/refs/heads/main/static/logo.png" data-canonical-src="/logo.png" width="130" height="130" />

# Django starter template

A comprehensive and easy-to-use starting point for your new API with **Django** and **DRF**.

[![Test Status](https://github.com/wilfredinni/django-starter-template/actions/workflows/test.yml/badge.svg)](https://github.com/wilfredinni/django-starter-template/actions/workflows/test.yml)
[![CodeQL Status](https://github.com/wilfredinni/django-starter-template/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/wilfredinni/django-starter-template/actions/workflows/github-code-scanning/codeql)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/wilfredinni/django-starter-template?tab=MIT-1-ov-file#readme)
</div>


## ✨ Key Features

This template is packed with features to help you build amazing APIs:

-   **User Authentication:** Secure token-based authentication with `django-rest-knox`.
-   **Background Tasks:** Asynchronous task processing with `Celery` and `Redis`.
-   **API Documentation:** Automatic OpenAPI 3 schema generation with `drf-spectacular`.
-   **Centralized Logging:** Structured JSON logging for easy monitoring.
-   **Custom User Model:** Email-based authentication for a modern user experience.
-   **And much more!** Explore the documentation to discover all the features.
-   **AI Tools:** Useful prompts to enhance your development experience with GitHub Copilot, Gemini CLI agent, and Roo Code.

## Quick Start

### Prerequisites
- 🐋 Docker
- 🐳 Docker Compose
- ⚡ uv (for IDE support)
- 🛠️ make (optional, for shortcuts)

### Setup Steps

1. Use [GitHub's template feature](https://github.com/new?template_name=django-starter-template&template_owner=wilfredinni) (recommended) or clone repository
2. Start services: `make up` (or `docker compose up`)
3. In another terminal, run migrations: `make migrate` (or `docker compose exec backend python manage.py migrate`)
4. Create superuser: `make superuser` (or `docker compose exec backend python manage.py createsuperuser`)
5. Access API at `http://localhost:8000`

**Quick Commands:**
```bash
make help          # See all available commands
make test          # Run tests
make seed          # Populate database with sample data
make logs          # View application logs
```

**For IDE support (IntelliSense, autocomplete):**
```bash
uv sync --all-extras
```
This installs dependencies locally so your IDE can provide code completion while your code runs in Docker.

## 📖 Explore the Documentation

This documentation is your guide to building amazing applications with the Django Starter Template. Use the navigation on the left to explore the different sections.

-   **[Development](https://wilfredinni.github.io/django-starter-template/development):** Learn about the development workflow, including how to run tests, and use the scripts.
-   **[AI Tools](https://wilfredinni.github.io/django-starter-template/ai_tools):** Explore useful prompts to enhance your development experience with GitHub Copilot.
-   **[Project Structure](https://wilfredinni.github.io/django-starter-template/project_structure):** Get an overview of the project's directory structure.
-   **[Project Settings](https://wilfredinni.github.io/django-starter-template/settings):** Understand the available settings and how to configure your project.
-   **[Dependencies](https://wilfredinni.github.io/django-starter-template/dependencies):** See a list of all the project's dependencies.
-   **[Authentication](https://wilfredinni.github.io/django-starter-template/authentication):** Learn how to use the authentication and user management endpoints.
-   **[Core App](https://wilfredinni.github.io/django-starter-template/core_endpoints):** Discover the core functionalities and API endpoints.
-   **[Logging](https://wilfredinni.github.io/django-starter-template/logging):** Understand the logging system and how to use it.
-   **[Celery Tasks](https://wilfredinni.github.io/django-starter-template/tasks):** Learn how to create and manage background tasks.
-   **[Rate Limiting](https://wilfredinni.github.io/django-starter-template/rate_limiting):** Configure rate limiting to protect your API.
-   **[Database Seeding](https://wilfredinni.github.io/django-starter-template/database_seeding):** Learn how to seed your database with initial data.
-   **[Testing](https://wilfredinni.github.io/django-starter-template/testing):** Understand how to run and write tests for your project.
-   **[Environment Setup](https://wilfredinni.github.io/django-starter-template/environment_setup):** Learn how to set up your development environment.
