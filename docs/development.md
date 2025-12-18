# Development Workflow

## Overview

This guide outlines the essential commands and best practices for developing your application within the Django Starter Template using Docker Compose.

## Development Setup

### Docker Compose

This approach runs all services (PostgreSQL, Redis, Django, Celery) in Docker containers while you work on your local machine with full IDE support.

**1. (Optional) Create `.env` file:**

Docker Compose already defines environment variables, but if you need a local `.env` file:

```bash
cp .env.example .env
```

**2. Start services:**
```bash
docker compose up
# Or using make:
make up
```

This starts:
- `db` - PostgreSQL database on port 5432
- `redis` - Redis cache on port 6379
- `backend` - Django development server on port 8000
- `worker` - Celery worker for background tasks
- `beat` - Celery beat scheduler

**3. Enable IDE support (IntelliSense, autocomplete):**

For your IDE to recognize dependencies, install them locally:

```bash
uv sync --all-extras
```

This creates a local virtual environment that your IDE uses for:
- Code completion and IntelliSense
- Import resolution
- Type checking
- Linting and formatting

**Note:** Your code still runs in Docker containers, but your IDE uses the local environment for editor features.

**4. Common tasks:**

The project includes a `Makefile` with shortcuts for common operations. Run `make help` to see all available commands.

```bash
# Service Management
make up              # Start all services
make down            # Stop all services
make build           # Build Docker image
make rebuild         # Rebuild and restart
make ps              # Show running containers

# Django Commands
make shell           # Open Django shell
make migrate         # Run migrations
make makemigrations  # Create migrations
make superuser       # Create superuser
make seed            # Seed database with test data

# Testing & Debugging
make test            # Run all tests
make test-cov        # Run tests with coverage
make logs            # View backend logs
make logs-worker     # View Celery worker logs
make logs-beat       # View Celery beat logs

# Dependency Management
make update-deps     # Update all dependencies
make add-dep         # Add a new dependency (pkg=name)
make remove-dep      # Remove a dependency (pkg=name)

# Maintenance
make clean           # Stop services and remove volumes
make prune           # Remove unused Docker resources
```

**Traditional docker compose commands still work:**

```bash
# Run migrations
docker compose exec backend python manage.py migrate

# Create migrations
docker compose exec backend python manage.py makemigrations

# Create superuser
docker compose exec backend python manage.py createsuperuser

# Run Django shell
docker compose exec backend python manage.py shell

# View logs
docker compose logs -f backend

# Rebuild containers after dependency changes
docker compose up --build

# Stop all services
docker compose down
```

**Important:** If your `.env` file contains special characters like `$` in values (e.g., in `DJANGO_SECRET_KEY`), escape them with `$$` to prevent Docker Compose from treating them as variables:

```ini
# Bad - Docker Compose interprets $d as a variable
DJANGO_SECRET_KEY=secret-key-with-$d-in-it

# Good - Escaped with $$
DJANGO_SECRET_KEY=secret-key-with-$$d-in-it
```

## Core Development Commands

### Using Make (Recommended)

For faster development, use the provided `Makefile` shortcuts:

| Make Command | Description |
| :--- | :--- |
| `make help` | Show all available commands |
| `make up` | Start all services |
| `make down` | Stop all services |
| `make migrate` | Apply database migrations |
| `make makemigrations` | Create new migrations |
| `make shell` | Open Django shell |
| `make test` | Run test suite |
| `make test-cov` | Run tests with coverage |
| `make logs` | View backend logs |
| `make seed` | Seed database with test data |

### Using Docker Compose Directly

You can also use docker compose commands directly:

| Command | Description |
| :--- | :--- |
| `docker compose exec backend python manage.py runserver` | Starts the Django development server (usually auto-started). |
| `docker compose exec backend python manage.py makemigrations` | Creates new database migrations based on model changes. |
| `docker compose exec backend python manage.py migrate` | Applies pending database migrations. |
| `docker compose exec backend pytest` | Runs the test suite using `pytest`. |
| `docker compose exec backend pytest --cov` | Runs the test suite and generates a coverage report. |

### Testing

The project utilizes `pytest` for its test suite. Below are common commands for running tests and generating coverage reports:

*   **Run all tests (using make):**
    ```bash
    make test
    ```
    Executes the entire test suite.

*   **Run tests with coverage (using make):**
    ```bash
    make test-cov
    ```
    Runs all tests and collects code coverage information.

*   **Generate an HTML coverage report (using make):**
    ```bash
    make test-html
    ```
    Generates a detailed HTML report of code coverage in the `htmlcov/` directory.

*   **Using docker compose directly:**
    ```bash
    # Run all tests
    docker compose exec backend pytest
    
    # Run tests with coverage
    docker compose exec backend pytest --cov
    
    # Generate HTML coverage report
    docker compose exec backend pytest --cov --cov-report=html
    ```

## Database Seeding

The template includes a powerful management command to populate your database with sample data, which is invaluable for development and testing. This command is part of the `apps/core/management/commands/seed.py` module.

**Usage with make (recommended):**

```bash
# Seed with 20 users + superuser, cleaning existing data
make seed
```

**Usage with docker compose:**

```bash
# Basic seeding with default options (creates 10 users)
docker compose exec backend python manage.py seed

# Create a specific number of users
docker compose exec backend python manage.py seed --users 20

# Create a superuser (admin@admin.com:admin)
docker compose exec backend python manage.py seed --superuser

# Clean existing data before seeding
docker compose exec backend python manage.py seed --clean

# Combine options
docker compose exec backend python manage.py seed --users 50 --superuser --clean
```

**Options:**

*   `--users <number>`: Specifies the number of regular users to create. Default is 10.
*   `--superuser`: Creates a default superuser (`admin@admin.com` with password `admin`).
*   `--clean`: Cleans (deletes) existing seeded data before generating new data. Use with caution as this will remove all existing users and related data.

## Asynchronous Tasks (Celery)

For handling background tasks and asynchronous operations, the project integrates Celery.

**With Docker Compose:**
Celery worker and beat are automatically started as separate services. Check their logs:
```bash
# Using make (recommended)
make logs-worker
make logs-beat

# Using docker compose
docker compose logs -f worker
docker compose logs -f beat
```

**Locally (if not using Docker Compose):**

*   **Start the Celery worker:**
    ```bash
    celery -A conf worker -l info
    ```
    This command starts a Celery worker process that executes tasks from the message queue.

*   **Start the Celery beat scheduler:**
    ```bash
    celery -A conf beat -l info
    ```
    This command starts the Celery beat scheduler, which is responsible for periodically executing scheduled tasks.

## Environment Variables

Environment variables are managed using a `.env` file, which is crucial for configuring application settings without hardcoding sensitive information. The project uses `django-environ` to load these variables.

*   **Development `.env` file:** Copy `.env.example` to `.env` and adjust values as needed for local development.
*   **Production `.env` file:** For production deployments, refer to the `.env.example` file at the project root for a comprehensive list of all required environment variables and their descriptions. This file serves as a template for setting up your production environment.
