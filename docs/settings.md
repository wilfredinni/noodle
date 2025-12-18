# Project Settings

## Overview

This document provides a comprehensive guide to the `conf/settings.py` file, which centralizes the configuration for the Django Starter Template. Understanding these settings is crucial for customizing and deploying your application effectively. The settings are organized into logical sections to facilitate navigation and comprehension.

## Environment Variables

The project leverages `django-environ` to manage environment variables, ensuring that sensitive information and deployment-specific configurations are kept out of version control. Variables are loaded from a `.env` file located in the project root.

**Configuration Snippet:**

```python
import environ

env = environ.Env()
root_path = environ.Path(__file__) - 2
env.read_env(str(root_path.path(".env")))
```

**Explanation:**

*   `env = environ.Env()`: Initializes the environment reader, which provides methods to access environment variables with type casting.
*   `root_path`: Defines the base directory for resolving relative paths within the project. It's calculated as two levels up from the `settings.py` file's location.
*   `env.read_env()`: Reads variables from the `.env` file. When called without arguments, it automatically searches for a `.env` file in the current working directory or its parent directories.

## Basic Configuration

These are fundamental Django settings that define the core behavior of the application:

*   `ROOT_URLCONF`: Specifies the root URL configuration module for the project. **Default:** `conf.urls`. This tells Django where to find the main URL patterns that route incoming requests.
*   `WSGI_APPLICATION`: The full Python path to the WSGI application object. **Default:** `conf.wsgi.application`. This is the entry point for WSGI-compatible web servers (e.g., Gunicorn) to serve the Django application.
*   `DEBUG`: A boolean that controls Django's debug mode. **Default:** `False` (loaded from `env.bool("DEBUG", default=False)`). When `True`, Django provides detailed error pages, automatically reloads code on changes, and enables other development-specific features. **It is critical to set this to `False` in production environments for security and performance reasons.**

## Time & Language

These settings control the localization and time zone behavior of the Django application:

*   `LANGUAGE_CODE`: The language code for this Django installation. **Default:** `en-us`. This setting influences the default language for Django's built-in messages, forms, and templates.
*   `TIME_ZONE`: The time zone for this installation. **Default:** `UTC`. Django uses this time zone for all datetime objects unless a specific timezone is explicitly activated (e.g., for a user's local time).
*   `USE_I18N`: A boolean that determines whether Django's internationalization system should be enabled. **Default:** `True`. When `True`, Django will look for translation files to provide localized content.
*   `USE_TZ`: A boolean that specifies whether Django's timezone support should be enabled. **Default:** `True`. When `True`, Django stores datetimes in UTC in the database and converts them to the appropriate local time zone for display, based on `TIME_ZONE` or user-specific settings.

## Security and Users

This section covers critical security configurations and user model settings, essential for protecting your application and managing user accounts:

*   `SECRET_KEY`: A unique secret key used for cryptographic signing in Django. **Default:** Loaded from the `DJANGO_SECRET_KEY` environment variable. **This key must be kept absolutely secret and never hardcoded in version control.**

    ```python
    SECRET_KEY = env("DJANGO_SECRET_KEY")
    ```

*   `ALLOWED_HOSTS`: A list of strings representing the host/domain names that this Django site can serve. **Default:** `["*"]` (loaded from `env.list("ALLOWED_HOSTS", default=["*"])`). This is a crucial security measure to prevent HTTP Host header attacks. **In production, always specify your exact domain names (e.g., `["api.example.com"]`) and never use `"*"` for security reasons.**

    ```python
    ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["*"])
    ```

*   `AUTH_USER_MODEL`: Specifies the custom user model to be used by Django's authentication system. **Default:** `users.CustomUser`. This allows for extending Django's default user model with custom fields and behaviors tailored to your application's needs.
*   `MIN_PASSWORD_LENGTH`: Defines the minimum length required for user passwords. **Default:** `8` (loaded from `env.int("MIN_PASSWORD_LENGTH", default=8)`). This setting is integrated with Django's password validation system to enforce stronger password policies.
*   `PASSWORD_HASHERS`: A list of password hashing algorithms used for storing user passwords. Django attempts to use them in the order specified. **Default:** Includes `ScryptPasswordHasher`, `PBKDF2PasswordHasher`, `PBKDF2SHA1PasswordHasher`, `Argon2PasswordHasher`, and `BCryptSHA256PasswordHasher`. This provides robust password security by using modern, secure hashing algorithms.
*   `AUTH_PASSWORD_VALIDATORS`: Configures the rules for password validation. **Default:** Includes validators for user attribute similarity, minimum length, common passwords, and numeric passwords. These can be customized to enforce more stringent password policies.

### Security Headers

These settings configure various HTTP security headers to protect against common web vulnerabilities:

*   `SECURE_BROWSER_XSS_FILTER`: Enables the `X-XSS-Protection` header. **Default:** `True`. This helps protect against Cross-Site Scripting (XSS) attacks by enabling the browser's built-in XSS filter.
*   `SECURE_CONTENT_TYPE_NOSNIFF`: Enables the `X-Content-Type-Options` header. **Default:** `True`. This prevents browsers from MIME-sniffing a response away from the declared `Content-Type`, mitigating certain types of attacks.
*   `X_FRAME_OPTIONS`: Controls the `X-Frame-Options` header to prevent clickjacking attacks. **Default:** `DENY`. This means the page cannot be displayed in a frame, iframe, or object tag.
*   `CSRF_COOKIE_SECURE`: A boolean that determines whether the CSRF cookie should only be sent over HTTPS. **Default:** `True` if `DEBUG` is `False`, `False` otherwise. **This should always be `True` in production environments to prevent cookie interception.**
*   `SESSION_COOKIE_SECURE`: A boolean that determines whether the session cookie should only be sent over HTTPS. **Default:** `True` if `DEBUG` is `False`, `False` otherwise. **Similar to `CSRF_COOKIE_SECURE`, this must be `True` in production for secure session management.**

## Databases

Database connection settings are managed through the `DATABASE_URL` environment variable, which `django-environ` parses to configure the database connection.

**Configuration Snippet:**

```python
DJANGO_DATABASE_URL = env.db("DATABASE_URL")
DATABASES = {"default": DJANGO_DATABASE_URL}
```

**Explanation:**

*   `DJANGO_DATABASE_URL`: This variable holds the database connection string, which is parsed by `django-environ` to extract database credentials and settings. **Default:** Loaded from the `DATABASE_URL` environment variable.
*   `DATABASES`: A dictionary that contains all database configurations for the project. The `default` key specifies the primary database connection used by the application.
*   `DEFAULT_AUTO_FIELD`: Defines the type of primary key to use for models that do not explicitly specify one. **Default:** `django.db.models.BigAutoField`. This uses a 64-bit integer, which is generally preferred over the default `AutoField` (32-bit) to prevent potential integer overflow issues in large-scale applications.

## Applications Configuration

This section details the configuration of installed Django applications and middleware, which are crucial for defining the project's functionalities and request-response processing flow:

*   `INSTALLED_APPS`: A list of strings specifying all Django applications enabled in this project. **Default:** This includes Django's built-in applications (e.g., `django.contrib.admin`, `django.contrib.auth`), essential third-party libraries (e.g., `whitenoise`, `rest_framework`, `knox`, `drf_spectacular`), and the project's local applications (`apps.users`, `apps.core`). This setting informs Django which application modules are active and should be loaded.

*   `MIDDLEWARE`: A list of middleware classes that process requests and responses globally across your Django application. **Default:** This typically includes security middleware, static files handling, session management, CORS headers, common utilities, CSRF protection, authentication, and custom middleware like `RequestIDMiddleware`. The order of middleware is critically important, as they are executed sequentially for incoming requests and in reverse order for outgoing responses.

## Templates

These settings configure Django's template engine, which is responsible for rendering HTML and other content:

*   `BACKEND`: Specifies the template engine to be used. **Default:** `django.template.backends.django.DjangoTemplates`.
*   `DIRS`: A list of absolute paths to directories where Django should search for template files. **Default:** `[root_path("templates")]`. This allows for project-wide templates to be organized outside of individual application directories.
*   `APP_DIRS`: A boolean that instructs Django to look for templates within the `templates` subdirectory of installed applications. **Default:** `True`. This is a convenient way to organize app-specific templates alongside their respective applications.
*   `OPTIONS`: A dictionary of additional options for the template engine. **Default:** Includes `context_processors` (functions that add variables to the template context, such as `debug`, `request`, `auth`, `messages`) and `builtins` (which register built-in template tags and filters for use in templates).

## REST Framework

This section details the settings for Django REST Framework (DRF) and related tools for API development, authentication, and schema generation.

### Token-Based Authentication

Configuration for `django-rest-knox`, the token-based authentication system used for secure API access:

*   `SECURE_HASH_ALGORITHM`: The hashing algorithm employed for generating and verifying authentication tokens. **Default:** `hashlib.sha512`.
*   `AUTH_TOKEN_CHARACTER_LENGTH`: Defines the length of the generated authentication tokens. **Default:** `64`.
*   `TOKEN_TTL`: Sets the time-to-live (TTL) for authentication tokens, determining how long a token remains valid after issuance. **Default:** `timedelta(hours=10)`.
*   `USER_SERIALIZER`: Specifies the serializer class used for user profiles when returning user-related data with tokens. **Default:** `apps.users.serializers.UserProfileSerializer`.
*   `TOKEN_LIMIT_PER_USER`: Allows limiting the number of active tokens a single user can possess simultaneously. **Default:** `None` (no limit).
*   `AUTO_REFRESH`: A boolean indicating whether tokens should be automatically refreshed upon use, extending their validity. **Default:** `False`.
*   `AUTO_REFRESH_MAX_TTL`: The maximum time-to-live for tokens that are automatically refreshed. **Default:** `None`.
*   `MIN_REFRESH_INTERVAL`: The minimum time interval (in seconds) that must pass between token refreshes. **Default:** `60` seconds.
*   `AUTH_HEADER_PREFIX`: The prefix expected in the `Authorization` HTTP header for token authentication (e.g., `Bearer <token>`). **Default:** `Bearer`.
*   `TOKEN_MODEL`: Refers to the Django model used by `django-rest-knox` to store authentication tokens. **Default:** `knox.AuthToken`.

### General DRF Settings

Core settings for Django REST Framework, influencing how APIs behave, including authentication, filtering, and rendering:

*   `DEFAULT_AUTHENTICATION_CLASSES`: Defines the authentication methods available for API endpoints. **Default:** `knox.auth.TokenAuthentication`. In `DEBUG` mode, `SessionAuthentication` and `BasicAuthentication` are also included for development convenience.
*   `DEFAULT_FILTER_BACKENDS`: Specifies the default filter backends used for enabling filtering, searching, and ordering capabilities on API list views. **Default:** `django_filters.rest_framework.DjangoFilterBackend`, `rest_framework.filters.SearchFilter`, `rest_framework.filters.OrderingFilter`.
*   `DEFAULT_RENDERER_CLASSES`: Determines how API responses are rendered. **Default:** `rest_framework.renderers.JSONRenderer`. In `DEBUG` mode, `BrowsableAPIRenderer` is also added, providing a user-friendly HTML interface for API interaction.
*   `DEFAULT_SCHEMA_CLASS`: Integrates `drf-spectacular` for automatic OpenAPI schema generation. **Default:** `drf_spectacular.openapi.AutoSchema`.
*   `DEFAULT_THROTTLE_RATES`: Configures rate limiting for different types of users or requests, helping to prevent API abuse. **Default:** `user: "1000/day"` (authenticated users), `anon: "100/day"` (unauthenticated users), `user_login: "5/minute"` (specific throttle for login attempts).

### OpenAPI Schema Generation
Settings for `drf-spectacular`, which generates OpenAPI 3 documentation for your API:

*   `TITLE`: The title displayed in your API documentation. **Default:** `Django Starter Template`.
*   `DESCRIPTION`: A brief description of your API, providing context for users of the documentation. **Default:** `A comprehensive starting point for your new API with Django and DRF`.
*   `VERSION`: The version number of your API. **Default:** `0.1.0`.
*   `SERVE_INCLUDE_SCHEMA`: A boolean indicating whether the raw OpenAPI schema endpoint should be included in the generated documentation. **Default:** `False`. Set to `True` if you want the raw schema to be directly accessible.

### CORS Headers

Settings related to Cross-Origin Resource Sharing (CORS), managed by `django-cors-headers`:

*   `CORS_ALLOW_ALL_ORIGINS`: A boolean that, when `True`, allows requests from all origins. **Default:** `True` if `DEBUG` is `True`, `False` otherwise. **For production environments, this should always be `False` for security reasons.**
*   `CORS_ALLOWED_ORIGINS`: A list of allowed origins for CORS requests. This setting is active when `CORS_ALLOW_ALL_ORIGINS` is `False`. **Default:** Loaded from the `CORS_ALLOWED_ORIGINS` environment variable, allowing you to specify trusted domains.

## Cache

These settings configure the caching mechanism, primarily utilizing Redis for efficient data storage and retrieval:

*   `CACHES`: A dictionary defining the cache backends available to the project. **Default:** Includes a `default` cache configured to use `django_redis.cache.RedisCache`.
*   `LOCATION`: The connection URL for the Redis server. **Default:** `redis://redis:6379` (loaded from `env("REDIS_URL", default="redis://redis:6379")`). This specifies the address and port of your Redis instance.
*   `OPTIONS`: Additional options passed to the Redis client. **Default:** `{"CLIENT_CLASS": "django_redis.client.DefaultClient"}`. This can be used to customize the Redis client's behavior.
*   `USER_AGENTS_CACHE`: The cache alias to be used for caching user agent information. **Default:** `default`. This allows for efficient storage and retrieval of user agent strings.

## Celery

These settings configure Celery, the distributed task queue used for handling asynchronous tasks and periodic jobs:

*   `CELERY_BROKER_URL`: The URL for the Celery message broker, which facilitates communication between the application and Celery workers. **Default:** `redis://redis:6379` (loaded from `env("CELERY_BROKER_URL", default="redis://redis:6379")`).
*   `CELERY_RESULT_BACKEND`: Specifies where Celery task results are stored after a task completes. **Default:** `django-db` (loaded from `env("CELERY_RESULT_BACKEND", default="django-db")`). This means results are stored in the Django database.
*   `CELERY_BEAT_SCHEDULER`: Defines the scheduler for periodic tasks. **Default:** `django_celery_beat.schedulers.DatabaseScheduler`. This allows you to manage and schedule recurring tasks directly from the Django admin interface.
*   `CELERY_ACCEPT_CONTENT`: A list of accepted content types for tasks, ensuring secure deserialization. **Default:** `["application/json"]`.
*   `CELERY_TASK_SERIALIZER`: The default serialization method used for tasks when they are sent to the broker. **Default:** `json`.
*   `CELERY_RESULT_SERIALIZER`: The default serialization method for task results when they are stored. **Default:** `json`.
*   `CELERY_TIMEZONE`: The timezone used by Celery for scheduling and executing tasks. **Default:** `America/Santiago`.
*   `CELERY_RESULT_EXTENDED`: A boolean that, when `True`, stores extended result information for tasks, providing more details about their execution. **Default:** `True`.

## Email

These settings configure the email backend, enabling the application to send emails for various purposes (e.g., user registration, password resets):

*   `EMAIL_HOST`: The hostname or IP address of the SMTP server used for sending emails. **Default:** `smtp.gmail.com` (loaded from `env("EMAIL_HOST", default="smtp.gmail.com")`).
*   `EMAIL_USE_TLS`: A boolean that determines whether to use TLS (Transport Layer Security) for a secure connection to the SMTP server. **Default:** `True` (loaded from `env.bool("EMAIL_USE_TLS", default=True)`). It is highly recommended to keep this `True` for production.
*   `EMAIL_PORT`: The port number for the SMTP server. **Default:** `587` (loaded from `env.int("EMAIL_PORT", default=587)`). Common ports are 587 (for TLS) or 465 (for SSL).
*   `EMAIL_HOST_USER`: The username for authenticating with the SMTP server. **Default:** `""` (loaded from `env("EMAIL_HOST_USER", default="")`). This should be set to your email account username.
*   `EMAIL_HOST_PASSWORD`: The password for authenticating with the SMTP server. **Default:** `""` (loaded from `env("EMAIL_HOST_PASSWORD", default="")`). This should be set to your email account password or an application-specific password.

## Sentry and Logging

While the logging system has its own dedicated documentation page ([Logging System](logging.md)), this section briefly covers settings related to error tracking with Sentry and general logging configurations:

*   `IGNORABLE_404_URLS`: A list of regular expressions for URLs that should not trigger 404 errors in logging or error reporting systems (like Sentry). **Default:** Includes patterns for common favicon and Apple touch icon requests, reducing noise in logs.
*   `LOGGING`: This dictionary contains the detailed configuration for the project's logging system. For a comprehensive understanding of how logging is set up and used, refer to the [Logging System](logging.md) documentation.
*   `sentry_sdk.init()`: This function initializes the Sentry SDK for error tracking and performance monitoring. **Default:** It is conditionally initialized in production environments (when `DEBUG` is `False`) with parameters such as `dsn` (your Sentry project DSN), `traces_sample_rate=1.0` (for performance monitoring), and `profiles_sample_rate=1.0` (for profiling).

## Static & Media Files

These settings govern how static files (CSS, JavaScript, images) and user-uploaded media files are handled and served by the Django application:

*   `STORAGES`: Defines the storage backends for different types of files. **Default:** Uses `FileSystemStorage` for default file storage and `whitenoise.storage.CompressedManifestStaticFilesStorage` for static files, which handles compression and caching for production.
*   `STATIC_URL`: The URL prefix to use when referring to static files. **Default:** `/static/`. For example, if you have a static file `my_app/static/css/style.css`, it would be accessible at `/static/css/style.css`.
*   `STATICFILES_DIRS`: A list of directories where Django will search for additional static files, beyond those found within individual app's `static/` directories. **Default:** `[root_path("static")]`.
*   `STATIC_ROOT`: The absolute path to the directory where Django's `collectstatic` command will gather all static files for deployment. **Default:** A temporary directory if `DEBUG` is `True`, otherwise a `static_root` directory within the project root. **This directory should be served directly by your web server in production.**
*   `MEDIA_URL`: The URL prefix that handles media files served from `MEDIA_ROOT`. **Default:** `/media/`. This is used for user-uploaded content.
*   `MEDIA_ROOT`: The absolute path to the directory where user-uploaded media files are stored. **Default:** A `media_root` directory within the project root. **This directory should be configured for serving by your web server.**
*   `ADMIN_MEDIA_PREFIX`: The URL prefix for Django admin's static media files. **Default:** `/static/admin/`.

## Django Debug Toolbar and Django Extensions

These development-centric tools are conditionally enabled only when Django's `DEBUG` mode is active, providing valuable insights and utilities during development:

*   `debug_toolbar`: Integrates the Django Debug Toolbar, which provides a customizable debug panel for inspecting various aspects of your Django application (e.g., SQL queries, request/response headers, templates). **Default:** Automatically added to `INSTALLED_APPS` and `MIDDLEWARE` if `DEBUG` is `True`.
*   `INTERNAL_IPS`: A list of IP addresses that are considered "internal" for the Django Debug Toolbar. Requests originating from these IP addresses will display the debug toolbar. **Default:** `["127.0.0.1"]`.
*   `django_extensions`: Provides a collection of custom extensions for Django, including a variety of useful management commands (e.g., `runserver_plus`, `shell_plus`). **Default:** Automatically added to `INSTALLED_APPS` if `DEBUG` is `True`.

These settings are dynamically included in `INSTALLED_APPS` and `MIDDLEWARE` when `DEBUG` is `True`, ensuring they are only active in development environments.