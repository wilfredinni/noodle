# Core Application

## Overview

This section provides an overview of the Core application (`apps/core/`), which serves as a foundational component within the Django Starter Template. It encapsulates common utilities, middleware, base tasks, and essential API endpoints.

## Key Functionalities

The `apps/core/` directory includes the following key functionalities:

*   **Middleware**: Contains custom middleware, such as `RequestIDMiddleware`, which enriches logs and responses with request-specific details like `request_id`, client IP, and response time.
*   **Tasks**: Provides base Celery task classes, including `BaseTaskWithRetry`, which offers common functionalities like automatic retries for background tasks, enhancing task reliability.
*   **Schema**: Defines common OpenAPI schema components and examples, promoting reusability and consistency across API documentation.
*   **Management Commands**: Includes custom Django management commands, such as the `seed` command, designed for populating the database with sample data for development and testing purposes.

## API Endpoints

The Core application exposes the following API endpoints, all prefixed with `/core/`:

### Ping

This is a simple endpoint designed to verify that the server is operational and responsive.

**Request:**

*   **Method:** `GET`
*   **URL:** `/core/ping/`

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "ping": "pong"
    }
    ```
    *   Returns a JSON object with a `ping` key and `pong` value, indicating a successful response.

### Fire Task

This endpoint triggers a sample Celery task in the background. It's useful for testing the Celery setup and task execution.

**Request:**

*   **Method:** `GET`
*   **URL:** `/core/fire-task/`

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "task": "Task fired"
    }
    ```
    *   Returns a confirmation that the task has been successfully initiated.