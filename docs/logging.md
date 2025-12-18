# Logging System

This section details the logging system implemented in the Django Starter Template, covering its configuration, features, and how to interpret the generated logs.

## Overview

The template utilizes a centralized logging system configured within `conf/settings.py`. It's designed to provide comprehensive and structured logs, making it easier to monitor, debug, and analyze application behavior, especially in production environments.

## Key Features

*   **JSON Format**: All logs are formatted as JSON, enabling easy parsing and integration with log management tools.
*   **Multiple Handlers**: Different types of logs are directed to specific handlers and files:
    *   `console`: Outputs logs to the console, primarily used during development.
    *   `app.log`: General application logs.
    *   `security.log`: Specifically captures authentication events and security-related messages.
    *   `error.log`: Records all error-level messages.
    *   `info.log`: Records all info-level messages.
*   **Rotating Files**: To prevent log files from growing indefinitely, they are configured to rotate. Each log file has a maximum size of 10MB, and up to 5 backup files are kept.
*   **Request Tracing**: A custom middleware (`apps.core.middleware.RequestIDMiddleware`) assigns a unique `request_id` to each incoming request. This ID, along with other request-specific details (client IP, request path, authenticated user ID, response time, and HTTP status code), is automatically injected into every log record. This allows for end-to-end tracing of requests.
*   **Sentry Integration**: In production environments, Sentry is integrated for advanced error tracking and performance monitoring.

## Log File Locations

All log files are stored in the `logs/` directory at the root of the project:

*   `logs/app.log`: General application logs.
*   `logs/security.log`: Authentication and security events.
*   `logs/error.log`: Error-level logs.
*   `logs/info.log`: Info-level logs.

## Example Log Entry

Log entries are in JSON format, providing rich context for each event. Here's an example:

```json
{
    "asctime": "2025-05-04 14:17:22,365",
    "levelname": "INFO",
    "module": "views",
    "process": 5929,
    "thread": 281473186128320,
    "message": "Ping request received",
    "client": "127.0.0.1",
    "request_id": "0d7344bd-0e6f-426d-aeed-46b9d1ca36bc",
    "path": "/core/ping/",
    "user_id": 1,
    "status_code": 401,
    "response_time": 0.0019102096557617188
}
```

Each field in the JSON provides specific information:

*   `asctime`: Timestamp of the log entry.
*   `levelname`: The logging level (e.g., INFO, WARNING, ERROR).
*   `module`: The Python module where the log originated.
*   `process`: The process ID.
*   `thread`: The thread ID.
*   `message`: The actual log message.
*   `client`: The IP address of the client making the request.
*   `request_id`: A unique identifier for the request, useful for tracing.
*   `path`: The URL path of the request.
*   `user_id`: The ID of the authenticated user (or "anonymous" if not authenticated).
*   `status_code`: The HTTP status code of the response.
*   `response_time`: The time taken to process the request in seconds.
