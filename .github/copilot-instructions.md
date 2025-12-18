# Django Starter Template - AI Development Guide

## Architecture Overview

This is a **production-ready Django 5.1+ API template** with:
- **Custom email-based authentication** using `django-rest-knox` (no username field)
- **Async task processing** via Celery + Redis with automatic retry patterns
- **Structured JSON logging** with request ID tracking and performance metrics
- **Auto-generated OpenAPI docs** via `drf-spectacular`
- **Ultra-fast dependency management** with `uv` (10-100x faster than pip/Poetry)

## Key Development Patterns

### Project Structure
```
apps/                    # Django apps (users, core)
├── users/               # Custom user model with email auth
├── core/                # Shared utilities, middleware, tasks
conf/                    # Django settings and configuration
```

### Custom User Implementation
- **No username field** - uses `CustomUser(AbstractUser)` with `email` as `USERNAME_FIELD`
- Located in `apps/users/models.py` with `CustomUserManager`
- All auth flows expect email-based authentication
- Example: `CustomUser.objects.create_user(email="user@example.com", password="pass")`

### Celery Task Architecture
```python
# Use BaseTaskWithRetry for all background tasks in apps/{app}/tasks.py
from apps.core.tasks import BaseTaskWithRetry
from celery import shared_task

@shared_task(bind=True, base=BaseTaskWithRetry)
def your_task(self):
    # Auto-retry up to 3 times with exponential backoff + jitter
    # Catches Exception and KeyError by default
```
- Retry config: `max_retries=3`, `retry_backoff=5s`, `retry_jitter=True`
- Celery Beat uses `django-celery-beat` (schedule tasks via Django admin)
- Results stored in database via `django-celery-results`

### Logging & Request Tracking
- All requests get unique IDs via `RequestIDMiddleware` in `apps/core/middleware.py`
- Thread-local storage tracks: `request_id`, `client_ip`, `path`, `user_id`, `response_time`, `status_code`
- Use structured logging: `logger = logging.getLogger("django.security")` for auth events
- Four separate log files with JSON formatting:
  - `logs/app.log` - general application logs
  - `logs/error.log` - ERROR level and above
  - `logs/info.log` - INFO level events
  - `logs/security.log` - authentication/authorization events
- Custom filters: `RequestIDFilter` adds request context, `TimeLogFilter` requires response_time

### API Development Standards
- **Always use `@extend_schema()` decorators** from `drf-spectacular` for auto-documentation
- See `apps/users/schema.py` for response schema examples
- Implement rate limiting with custom throttle classes (inherit `SimpleRateThrottle`)
  - Example: `UserLoginRateThrottle` in `apps/users/throttles.py` uses scope `"user_login"`
  - Configure rates in settings: `REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']`
- Authentication via Knox tokens with `Bearer` prefix (10-hour expiry default)
- Return structured JSON responses - use DRF serializers, not raw dicts

### Testing Patterns
- Use `APITestCase` from `rest_framework.test` for view tests
- Pattern: `self.client.force_authenticate(user=self.admin_user)` for authenticated requests
- **Mock logging calls**: `with patch.object(logging.Logger, "info") as mock_logger:`
- Test-specific settings in `conf/test_settings.py` (relaxed throttling, test RequestID middleware)
- Run in container: `docker compose exec backend pytest` (uses `pytest.ini` config)

## Essential Commands

### Make Shortcuts (Recommended)
```bash
# Service Management
make up              # Start all services (backend, db, redis, worker, beat)
make down            # Stop all services
make build           # Build Docker image
make rebuild         # Rebuild and restart services
make ps              # Show running containers

# Django Management
make migrate         # Run database migrations
make makemigrations  # Create new migrations
make superuser       # Create a superuser
make seed            # Seed database (20 users + superuser)
make shell           # Open Django shell

# Testing and Debugging
make test            # Run all tests
make test-cov        # Run tests with coverage
make test-html       # Run tests with HTML coverage report
make logs            # View backend logs (follow mode)
make logs-worker     # View Celery worker logs
make logs-beat       # View Celery beat logs

# Maintenance
make clean           # Stop services and remove volumes
make prune           # Remove unused Docker resources
```

### Docker Compose Workflow (Alternative)
```bash
# Start all services (backend, db, redis, worker, beat)
docker compose up

# Backend management commands (always use docker compose exec)
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py makemigrations
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py seed --users 20 --superuser --clean
docker compose exec backend python manage.py shell

# Testing and debugging
docker compose exec backend pytest                    # Run all tests
docker compose exec backend pytest --cov             # With coverage
docker compose exec backend pytest apps/users/tests/ # Specific app
docker compose logs -f backend  # View backend logs
docker compose logs -f worker   # View Celery worker logs
```

### Local IDE Support (Optional)
```bash
# Install dependencies locally for VS Code IntelliSense (code still runs in Docker)
uv sync
```

### Database Seeding
```bash
# Using make (recommended)
make seed

# Custom management command in apps/core/management/commands/seed.py
docker compose exec backend python manage.py seed --users 10 --superuser --clean
```

## Integration Points

### Knox Authentication Flow
- Token creation returns full user profile via `REST_KNOX['USER_SERIALIZER']`
- Set to `"apps.users.serializers.UserProfileSerializer"` in settings
- Tokens expire after 10 hours (`TOKEN_TTL`: `timedelta(hours=10)`)
- Login throttled via `UserLoginRateThrottle` (scope: `"user_login"`)

### Celery + Redis Configuration
- Broker: `CELERY_BROKER_URL` (Redis connection string)
- Results backend: `django-celery-results` (stores task outcomes in database)
- Beat scheduler: `DatabaseScheduler` from `django-celery-beat`
- Timezone: `America/Santiago` (configure in settings)
- Worker waits for migrations via `scripts/wait-for-migrations.sh`

### Middleware Chain Order (Critical)
```python
# From conf/settings.py MIDDLEWARE list
1. SecurityMiddleware
2. WhiteNoiseMiddleware
3. XFrameOptionsMiddleware
4. SessionMiddleware
5. CorsMiddleware
6. CommonMiddleware
7. CsrfViewMiddleware
8. AuthenticationMiddleware
9. RequestIDMiddleware (custom - adds request.id)
10. MessagesMiddleware
```

### Environment Variables Pattern
- Settings use `django-environ` for `.env` file parsing
- Database: `DATABASE_URL=postgres://user:pass@host:port/dbname`
- Redis: `REDIS_URL=redis://redis:6379/0`
- Security: `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS` (comma-separated list)
- Debugging: `DEBUG=True/False` (enables browsable API, debug toolbar)

## File Naming Conventions
- Tests: `apps/{app}/tests/test_{feature}_view.py`, `test_{model}_model.py`
- Tasks: `apps/{app}/tasks.py` (auto-discovered by Celery)
- URLs: App-level `apps/{app}/urls.py` included via `include()` in `conf/urls.py`
- Serializers: `apps/{app}/serializers.py` (group by feature)
- Custom throttles: `apps/{app}/throttles.py`

## Critical Implementation Notes

### Authentication & Users
- **Never use username field** - it's set to `None` in `CustomUser` model
- All user references must use `email` (e.g., `authenticate(email=email, password=password)`)
- Password validation: minimum 8 chars by default (`MIN_PASSWORD_LENGTH` setting)
- Security logging: `security_logger.info(f"User {user.email} logged in.")`

### Docker & Command Execution
- **Always use `docker compose exec backend`** for Django commands (not `docker exec` or local `python`)
- Backend runs auto-migrations on startup: `sh -c "python manage.py migrate && python manage.py runserver"`
- Worker/Beat wait for migrations via `wait-for-migrations.sh` script

### API Documentation
- Use `@extend_schema()` on all API views for OpenAPI schema generation
- Define response schemas in `apps/{app}/schema.py` (see `users/schema.py` for examples)
- Access docs at `/api/schema/swagger-ui/` and `/api/schema/redoc/`
- Configure `SPECTACULAR_SETTINGS` in settings (title, description, version)

### Code Quality Patterns
- Inherit `BaseTaskWithRetry` for all Celery tasks (provides automatic retry logic)
- Use `self.client.force_authenticate()` in tests (not manual token creation)
- Mock logging calls in tests: `patch.object(logging.Logger, "info")`
- Validate passwords with Django validators in serializers (see `CreateUserSerializer`)

### Dependency Management
- Dependencies defined in `pyproject.toml` (uv format)
- Lock file: `uv.lock` (commit this to repo)
- Dockerfile exports to `requirements.txt` via `uv export --no-hashes --all-extras`
- Install system packages: modify `apt-get install` section in Dockerfile
