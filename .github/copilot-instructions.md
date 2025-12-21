# Noodle - Full Stack AI Development Guide

## Architecture Overview

This is a production-ready full-stack application consisting of:
- **Backend**: Django 5.1+ API with Celery/Redis (Dockerized).
- **Frontend**: React 19 + TanStack ecosystem (Start, Router, Query, Form) served via Nitro/Vite.
- **Auth**: Custom email-based authentication with Knox tokens (Backend) and TanStack Start Session (Frontend).

## Backend (Django) Guide

### Project Structure
```
apps/
├── finance/             # Core domain (Budgeting)
│   ├── models/          # Models package (Account, Transaction, Category)
│   ├── services.py      # Business logic (e.g., payment date calc)
│   └── views.py         # DRF ViewSets
├── users/               # Custom user model with email auth
├── core/                # Shared utilities, middleware, tasks
conf/                    # Django settings and configuration
```

### Key Patterns
- **Models**: 
  - Use `apps/finance/models/` package for domain models.
  - Inherit `BaseModel` from `apps/core/models.py` for `created_at`/`updated_at`.
  - `CustomUser` in `apps/users` uses email as username.
- **Service Layer**: Put complex business logic in `services.py` (e.g., `apps/finance/services.py`), not in views or models.
- **Tasks**: Inherit `BaseTaskWithRetry` in `apps/core/tasks.py` for auto-retries.
- **API Docs**: Use `@extend_schema()` on views. Docs at `/api/schema/swagger-ui/`.
- **Dependency Management**: Uses `uv` for fast Python package management.

### Critical Backend Commands
- **Start Services**: `make up` (starts Django, Postgres, Redis, Celery)
- **Run Migrations**: `make migrate` (or `docker compose exec backend python manage.py migrate`)
- **Tests**: `make test` (runs `pytest`)
- **Shell**: `make shell`
- **Logs**: `make logs` (backend), `make logs-worker` (worker)

*Note: Always run Django commands inside the container via `docker compose exec backend ...`*

## Frontend (React/TanStack) Guide

### Tech Stack
- **Framework**: React 19, Vite, TanStack Start (SSR/Server Functions).
- **Router**: `@tanstack/react-router` (File-based routing in `src/routes`).
- **Data**: `@tanstack/react-query` (Server state & caching).
- **Forms**: `@tanstack/react-form` + Zod.
- **Styling**: Tailwind CSS v4, shadcn/ui (`src/components/ui`).
- **Runtime**: Bun.

### Project Structure
```
frontend/
├── src/
│   ├── routes/          # File-based routes (TanStack Router)
│   ├── components/ui/   # shadcn/ui primitives
│   ├── lib/
│   │   ├── api.ts       # API client wrapper
│   │   ├── auth.server.ts # Server functions (Login, Session)
│   │   └── session.ts   # Session management
│   └── hooks/           # Custom hooks (e.g., forms)
```

### Key Development Patterns

#### 1. Server Functions & Auth
- **Server Functions**: Use `createServerFn` (e.g., `auth.server.ts`) for backend interactions that need to run on the frontend server (Nitro).
- **Session**: Managed via `useAppSession` in `lib/session.ts`.
- **API Client**: Use `fetchAPI` from `@/lib/api` for direct client-side calls to Django. It handles token attachment and 401s.

#### 2. Routing & Data Loading
- **File-based**: Create files in `src/routes`. `__root.tsx` is the layout.
- **Loaders**: Use `loader` in route files to pre-fetch data via QueryClient.
- **Protection**: Use `beforeLoad` in `_authenticated.tsx` to check session/auth.

#### 3. Forms
- Use `@tanstack/react-form` with Zod validation.
- See `src/hooks/demo.form.ts` for `createFormHook` usage.

### Frontend Commands (Run in `frontend/` dir)
- **Install**: `bun install`
- **Dev Server**: `bun dev` (Port 3000)
- **Lint/Format**: `bun run check` (Biome)
- **Test**: `bun test` (Vitest)

## Integration Points

### Authentication Flow
1. **Login**: Frontend calls `loginFn` (Server Function).
2. **Proxy**: `loginFn` calls Django `/api/auth/login/`.
3. **Token**: Django returns Knox token.
4. **Session**: Frontend Server stores token in secure session cookie.
5. **Requests**: `fetchAPI` retrieves token from session/context and attaches to `Authorization` header.

### Environment Setup
- **Backend**: `.env` file (loaded by docker-compose).
- **Frontend**: `frontend/.env` (Vite loads `VITE_*` vars).

