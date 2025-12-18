# Celery Tasks

This section provides a comprehensive guide to working with Celery tasks in the Django Starter Template, including how to create, configure, and manage them, with a focus on retry mechanisms and periodic tasks.

## Overview

Celery is an asynchronous task queue/job queue based on distributed message passing. It's used in this project to offload long-running operations from the main request-response cycle, improving application responsiveness and scalability.

## Configuration

Celery is configured in `conf/celery.py`. It integrates with Django's settings, allowing you to manage Celery-related configurations within your Django project.

Key settings are typically found in `conf/settings.py`:

*   `CELERY_BROKER_URL`: The URL for the message broker (e.g., Redis).
*   `CELERY_RESULT_BACKEND`: Where task results are stored (e.g., Django database).
*   `CELERY_BEAT_SCHEDULER`: Specifies the scheduler for periodic tasks.

## Creating New Tasks

To create a new Celery task, use the `@shared_task` decorator from `celery`.

```python
from celery import shared_task

@shared_task
def my_new_task(arg1, arg2):
    # Your task logic here
    print(f"Executing my_new_task with {arg1} and {arg2}")
```

Place your task definitions in `tasks.py` files within your Django apps (e.g., `apps/core/tasks.py`). Celery is configured to automatically discover tasks in installed apps.

## Task Retries

The template provides a custom base task class, `BaseTaskWithRetry`, located in `apps/core/tasks.py`, which simplifies implementing retry logic for your tasks.

### `BaseTaskWithRetry` Attributes

*   `autoretry_for`: A tuple of exception types that should trigger a retry. If any of these exceptions occur during task execution, Celery will automatically retry the task.
*   `retry_kwargs`: A dictionary of keyword arguments passed to the `retry()` method. The most common is `max_retries`, which defines the maximum number of times the task will be retried.
*   `retry_backoff`: The initial delay in seconds before the first retry attempt. Subsequent retries will have an exponentially increasing delay.
*   `retry_jitter`: A boolean that, when `True`, adds a random component to the retry delay. This helps prevent all failed tasks from retrying simultaneously, which can lead to a "thundering herd" problem.

### Example Usage

To use `BaseTaskWithRetry` for your task, simply set its `base` argument in the `@shared_task` decorator:

```python
from celery import shared_task
from apps.core.tasks import BaseTaskWithRetry

@shared_task(bind=True, base=BaseTaskWithRetry)
def my_retriable_task(self):
    try:
        # Your task logic that might fail
        result = 1 / 0 # Example of an error
        return result
    except Exception as e:
        # Log the error or perform any necessary cleanup before retrying
        print(f"Task failed: {e}. Retrying...")
        raise self.retry(exc=e)
```

## Calling Tasks

Tasks can be called in a few ways:

*   **Asynchronously (recommended for most cases):**

    ```python
    my_new_task.delay(arg1_value, arg2_value)
    ```

*   **With more control (e.g., setting a countdown or ETA):**

    ```python
    from datetime import datetime, timedelta

    # Execute in 10 seconds
    my_new_task.apply_async((arg1_value, arg2_value), countdown=10)

    # Execute at a specific time
    eta_time = datetime.now() + timedelta(minutes=5)
    my_new_task.apply_async((arg1_value, arg2_value), eta=eta_time)
    ```

## Periodic Tasks

Celery Beat is a scheduler that kicks off tasks periodically. In this project, periodic tasks are managed through the Django Admin interface.

### Steps to Configure a Periodic Task

1.  **Start Celery Worker**: Ensure your Celery worker is running (automatic with Docker Compose):

    ```bash
    docker compose logs -f worker
    ```

2.  **Start Celery Beat**: Ensure the Celery Beat scheduler is running (automatic with Docker Compose):

    ```bash
    docker compose logs -f beat
    ```

3.  **Configure in Django Admin**: Navigate to the Django Admin interface (`/admin-panel/`). Under the `DJANGO CELERY BEAT` section, you can add and manage `Periodic tasks`. You'll need to specify:
    *   The task name (e.g., `apps.core.tasks.my_periodic_task`).
    *   The schedule (e.g., every 5 minutes, daily, etc.).
    *   Any arguments or keyword arguments for the task.

### Example Periodic Task

```python
from celery import shared_task

@shared_task
def my_periodic_task():
    print("This task runs periodically!")
```
