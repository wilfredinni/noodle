<h1 align="center">Welcome to the Django Starter Template!</h1>

<p align="center">
  <img src="assets/logo.png" alt="Django Starter Template Logo" width="150"/>
</p>

<p align="center">
  <strong>A comprehensive starting point for your new API with Django and DRF.</strong>
</p>

## Overview

This documentation provides a comprehensive guide to the Django Starter Template, a robust foundation for building modern APIs with Django and Django REST Framework. It covers everything from initial setup and development workflows to advanced features like authentication, background tasks, and automated documentation.

## Quick Start

The recommended way to get started is by using Docker Compose.

### Prerequisites

To get started, ensure you have the following installed:

*   [Docker Desktop](https://www.docker.com/products/docker-desktop/)
*   [uv](https://docs.astral.sh/uv/) (optional, for local IDE support)

### Setup Steps

Follow these steps to set up your development environment:

1.  **Use the GitHub Template:** Begin by creating your own repository from the [Django Starter Template GitHub page](https://github.com/wilfredinni/django-starter-template) by clicking the green `Use this template` button.

2.  **Clone Repository:** Clone your newly created repository to your local machine.

3.  **Start Services:** Run `docker compose up` to start all services (PostgreSQL, Redis, Django, Celery).

4.  **Run Migrations:** In another terminal, run: `docker compose exec backend python manage.py migrate`.

5.  **Create a Superuser:** Create an administrative user for accessing the Django admin interface by running: `docker compose exec backend python manage.py createsuperuser`.

6.  **Install Local Dependencies (Optional):** For IDE support (IntelliSense, autocomplete), run: `uv sync`.

Your API should now be running and accessible at `http://127.0.0.1:8000`.

## Key Features

This template comes equipped with a rich set of features designed to accelerate your API development:

*   **User Authentication:** Implements secure, token-based authentication using `django-rest-knox`, providing a robust system for user management and access control.
*   **Background Tasks:** Leverages `Celery` and `Redis` for efficient asynchronous task processing, enabling your application to handle long-running operations without blocking the main thread.
*   **API Documentation:** Features automatic OpenAPI 3 schema generation with `drf-spectacular`, ensuring your API documentation is always up-to-date and easily explorable via Swagger UI.
*   **Centralized Logging:** Provides a structured JSON logging system for comprehensive and easily parsable application logs, facilitating monitoring and debugging.
*   **Custom User Model:** Utilizes a custom user model with email-based authentication, offering flexibility and a modern approach to user identity.
*   **GitHub Copilot Prompts:** Includes a collection of useful prompts tailored to enhance your development experience with GitHub Copilot, boosting productivity.
*   **Comprehensive Documentation:** This documentation serves as a detailed guide to all features and functionalities, helping you maximize the template's potential.

---

## Explore the Documentation

This documentation is your comprehensive guide to building robust applications with the Django Starter Template. Use the navigation on the left to explore various aspects of the project:

*   **[Development](development.md):** Learn about the development workflow, including how to run tests, and utilize provided scripts.
*   **[Project Structure](project_structure.md):** Gain an overview of the project's directory structure and organization.
*   **[Project Settings](settings.md):** Understand the available settings and how to configure your project for different environments.
*   **[Dependencies](dependencies.md):** Review a detailed list of all the project's dependencies and their purposes.
*   **[Authentication](authentication.md):** Dive into the authentication system, covering user management and API endpoints.
*   **[Core Application](core_endpoints.md):** Discover the core functionalities and essential API endpoints provided by the `apps/core` application.
*   **[Logging](logging.md):** Understand the structured logging system and how to effectively use it for monitoring and debugging.
*   **[Celery Tasks](tasks.md):** Learn how to create, manage, and monitor background tasks using Celery.
*   **[Rate Limiting](rate_limiting.md):** Configure and understand rate limiting to protect your API from abuse and ensure fair usage.
*   **[Database Seeding](database_seeding.md):** Learn how to populate your database with initial data for development and testing.
*   **[Testing](testing.md):** Understand how to write and run tests for your project to ensure code quality and reliability.
*   **[Environment Setup](environment_setup.md):** Get detailed instructions on setting up your development environment.
*   **[AI Tools](ai_tools/index.md):** Explore useful prompts to enhance your development experience with GitHub Copilot, Gemini CLI agent, and Roo Code.
