# Project Structure

## Overview

Understanding the project's directory structure is fundamental for navigating, developing, and maintaining the Django Starter Template. This document provides a detailed overview of the main directories and files, explaining their purpose and contents to help you quickly grasp the project's organization.

```
├── .clinerules/                # Gemini CLI rules
├── .coveragerc                 # Coverage.py configuration
├── .env.example                # Example environment variables file
├── .flake8                     # Flake8 linter configuration
├── .github/                    # GitHub CI/CD workflows and issue templates
├── .gitignore                  # Git ignore file
├── .pytest_cache/              # Pytest cache
├── .venv/                      # Virtual environment
├── .vscode/                    # IDE settings (VS Code configuration)
├── apps/                       # Django applications (core logic)
│   ├── core/                   # Core functionalities and shared components
│   │   ├── __init__.py         # Initializes the core app
│   │   ├── admin.py            # Django admin configuration for core app
│   │   ├── apps.py             # App configuration for core app
│   │   ├── management/         # Custom Django management commands
│   │   ├── middleware.py       # Custom middleware for core app
│   │   ├── migrations/         # Database migrations for core app
│   │   ├── schema.py           # OpenAPI schema definitions for core app
│   │   ├── tasks.py            # Celery task definitions for core app
│   │   ├── tests/              # Unit and integration tests for core app
│   │   └── urls.py             # URL routing for core app
│   └── users/                  # User management and authentication app
│       ├── __init__.py         # Initializes the users app
│       ├── admin.py            # Django admin configuration for users app
│       ├── apps.py             # App configuration for users app
│       ├── forms.py            # Custom forms for users app
│       ├── managers.py         # Custom managers for user models
│       ├── migrations/         # Database migrations for users app
│       ├── models.py           # User model definition
│       ├── schema.py           # OpenAPI schema definitions for users app
│       ├── serializers.py      # Serializers for users app
│       ├── tests/              # Unit and integration tests for users app
│       ├── throttles.py        # Rate limiting configurations for user-related views
│       ├── urls.py             # URL routing for users app
│       ├── utils.py            # Utility functions for users app
│       └── views.py            # API views for user authentication and profile management
├── conf/                       # Project-wide configuration
│   ├── __init__.py             # Initializes the conf module
│   ├── asgi.py                 # ASGI application entry point
│   ├── celery.py               # Celery application configuration
│   ├── settings.py             # Main Django settings file
│   ├── test_settings.py        # Settings specifically for running tests
│   ├── test_utils.py           # Test utilities
│   ├── urls.py                 # Main URL routing for the project
│   └── wsgi.py                 # WSGI application entry point
├── docs/                       # Documentation files
├── logs/                       # Application log files
├── manage.py                   # Django's command-line utility
├── mkdocs.yml                  # MkDocs configuration
├── notebook.ipynb              # Jupyter Notebook for interactive development
├── uv.lock                     # uv lock file
├── pyproject.toml              # Project dependencies and metadata (uv)
├── pytest.ini                  # Pytest configuration
├── README.md                   # Project README file
├── renovate.json               # Renovate Bot configuration for dependency updates
├── scripts/                    # Utility scripts for various development tasks
├── static/                     # Static files (CSS, JavaScript, images)
└── templates/                  # Project-wide HTML templates
```

## Key Directories

This section describes the primary directories within the project and their respective purposes:

*   **`.github/`**: Stores GitHub-specific files, including GitHub Actions workflows for Continuous Integration (CI) and Continuous Deployment (CD), issue templates, and other repository settings. This directory automates various development processes.

*   **`.vscode/`**: Contains IDE configuration files for Visual Studio Code (optional). These settings can enhance the development experience by providing consistent formatting, linting, and debugging configurations for those using VS Code.

*   **`apps/`**: This is the core of your Django project, where individual Django applications (modules) reside. Each app is designed to be a self-contained unit responsible for a specific feature or set of features, promoting modularity and reusability.
    *   **`core/`**: Houses fundamental functionalities and shared components that are used across different parts of the application. This includes custom management commands, base Celery tasks, and common API schema definitions, serving as a foundational app.
    *   **`users/`**: Manages all aspects of user authentication and authorization. This includes user models, serializers, views, and related utilities for user registration, login, and profile management.

*   **`conf/`**: Contains project-wide configuration files that apply to the entire Django project, rather than being specific to a single app. This includes the main `settings.py`, URL routing (`urls.py`), ASGI/WSGI configurations, and Celery setup.

*   **`logs/`**: The designated directory for application log files. Different log levels and types (e.g., general application logs, security events, error logs) are typically written to separate files within this directory for easier monitoring and debugging.

*   **`scripts/`**: A collection of utility scripts that automate various development and maintenance tasks. These scripts can include commands for running the server, managing migrations, or executing custom project-specific operations.

*   **`static/`**: Stores static assets such as CSS stylesheets, JavaScript files, and images. These files are typically served directly by the web server and are essential for the frontend of the application.

*   **`templates/`**: Contains project-wide HTML templates that are not specific to any single Django application. These templates can be used for common pages like error pages or base layouts.

## Key Files

This section outlines the most important files at the project root and their functions:

*   **`.env.example`**: A template file that outlines all the environment variables required by the project. Developers should copy this to a `.env` file and fill in their specific values for local development, ensuring sensitive information is not hardcoded.

*   **`manage.py`**: Django's command-line utility for administrative tasks. This script is used for running the development server, performing database migrations, creating superusers, and executing custom management commands.

*   **`pyproject.toml`**: Used by uv (the dependency management tool) to define project metadata, dependencies, and build configurations. It serves as the central point for managing the project's Python environment.

*   **`pytest.ini`**: The configuration file for `pytest`, the testing framework used in this project. It specifies how tests should be discovered and run, including settings for code coverage analysis.

*   **`README.md`**: The main project documentation file, providing a high-level overview, quick start instructions, key features, and links to more detailed documentation. It's the first file new contributors typically read.

By adhering to this structured layout, the project promotes modularity, maintainability, and scalability, making it easier for developers to understand and contribute to the codebase.
