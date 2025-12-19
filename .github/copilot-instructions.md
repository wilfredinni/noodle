# Noodle - Full Stack AI Development Guide

## Architecture Overview

This is a production-ready full-stack application consisting of:
- **Backend**: Django 5.1+ API with Celery/Redis (Dockerized)
- **Frontend**: React 19 + TanStack ecosystem (Vite/Bun)
- **Auth**: Custom email-based authentication with Knox tokens

## Backend (Django) Guide

### Project Structure
```
apps/                    # Django apps (users, core)
├── users/               # Custom user model with email auth
├── core/                # Shared utilities, middleware, tasks
conf/                    # Django settings and configuration
```

### Key Patterns
- **User Model**: `CustomUser` (no username, email-based). Use `CustomUser.objects.create_user(email=...)`.
- **Tasks**: Inherit `BaseTaskWithRetry` in `apps/core/tasks.py` for auto-retries.
- **Logging**: Structured JSON logging with `RequestIDMiddleware`. Logs to `logs/app.log`.
- **API Docs**: Use `@extend_schema()` on views. Docs at `/api/schema/swagger-ui/`.
- **Dependency Management**: Uses `uv` for fast Python package management.

### Critical Backend Commands
- **Start Services**: `make up` (starts Django, Postgres, Redis, Celery)
- **Run Migrations**: `make migrate` (or `docker compose exec backend python manage.py migrate`)
- **Tests**: `make test` (runs `pytest`)
- **Shell**: `make shell`
- **Logs**: `make logs` (backend), `make logs-worker` (worker)

*Note: Always run Django commands inside the container via `docker compose exec backend ...`*

---

## Frontend (React) Guide

### Tech Stack
- **Core**: React 19, Vite, TypeScript
- **Router**: `@tanstack/react-router` (File-based routing in `src/routes`)
- **Data**: `@tanstack/react-query` (Server state & caching)
- **Forms**: `@tanstack/react-form` + Zod
- **Styling**: Tailwind CSS v4, shadcn/ui (`src/components/ui`)
- **Tooling**: Bun (Package Manager), Biome (Linting/Formatting)

### Project Structure
```
frontend/
├── src/
│   ├── routes/          # File-based routes (TanStack Router)
│   ├── components/ui/   # shadcn/ui primitives
│   ├── lib/
│   │   ├── api.ts       # API client wrapper
│   │   └── auth.server.ts # Auth utilities
│   └── integrations/    # Query/Router setup
```

### Key Development Patterns

#### 1. API Integration
- **Client**: Use `fetchAPI` from `@/lib/api`.
- **Behavior**: Automatically attaches `Authorization: Bearer <token>` and handles 401 redirects.
- **Example**:
  ```typescript
  import { fetchAPI } from "@/lib/api";
  
  // Inside a Query function
  const fetchUser = async () => {
    const res = await fetchAPI("/users/me/");
    return res.json();
  };
  ```

#### 2. Routing & Data Loading
- **File-based**: Create files in `src/routes`. `__root.tsx` is the layout.
- **Loaders**: Use `loader` in route files to pre-fetch data via QueryClient.
- **Pattern**:
  ```tsx
  export const Route = createFileRoute('/dashboard')({
    loader: ({ context: { queryClient } }) => 
      queryClient.ensureQueryData(dashboardQueryOptions),
    component: Dashboard,
  })
  ```

#### 3. UI Components
- **Location**: `src/components/ui/`
- **Style**: Tailwind CSS v4 classes.
- **Icons**: `lucide-react`.
- **Modifying**: These are "copy-paste" components (shadcn). Edit directly if needed.

### Frontend Commands (Run in `frontend/` dir)
- **Install**: `bun install`
- **Dev Server**: `bun dev` (Port 3000)
- **Lint/Format**: `bun run check` (Biome)
- **Test**: `bun test` (Vitest)

---

## Integration Points

### Authentication Flow
1. **Login**: Frontend sends credentials to `/api/auth/login/`.
2. **Token**: Backend returns Knox token.
3. **Storage**: Frontend stores token (likely in cookie/storage via `auth.server.ts`).
4. **Requests**: `fetchAPI` attaches token to `Authorization` header.

### Environment Setup
- **Backend**: `.env` file (loaded by docker-compose).
- **Frontend**: `frontend/.env` (Vite loads `VITE_*` vars).
- **API URL**: Configured in `frontend/src/lib/config.ts`.

## Common Workflows

### Full Stack Startup
1. **Backend**: Run `make up` in root.
2. **Frontend**: Run `cd frontend && bun dev`.
3. **Access**: Frontend at `http://localhost:3000`, API at `http://localhost:8000`.

### Database Management
- **Seed Data**: `make seed` (Creates 20 users + superuser).
- **Reset**: `make clean` then `make up`.

### Testing
- **Backend**: `make test` (Pytest with coverage).
- **Frontend**: `cd frontend && bun test` (Vitest).
