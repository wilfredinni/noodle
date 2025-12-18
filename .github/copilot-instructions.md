# Noodle Project - AI Development Guide

## Project Overview
Full-stack application combining a **Django 5.1+ API** (backend) and a **TanStack Start** application (frontend).

- **Backend**: Django, Celery, Redis, PostgreSQL (Dockerized)
- **Frontend**: React 19, TanStack Start, Tailwind CSS v4, Biome
- **Package Managers**: `uv` (Backend), `bun` (Frontend)

---

## 1. Backend Architecture (Django)

### Core Patterns
- **Auth**: Custom email-based auth (no username) using `django-rest-knox`.
  - User model: `apps.users.models.CustomUser`
  - Auth header: `Authorization: Bearer <token>`
- **Tasks**: Async processing via Celery + Redis.
  - Inherit `apps.core.tasks.BaseTaskWithRetry` for auto-retries.
- **Logging**: Structured JSON logging with request ID tracking (`apps.core.middleware.RequestIDMiddleware`).
- **API Docs**: Auto-generated via `drf-spectacular` (`@extend_schema`).

### Key Directories
- `apps/users/`: Custom user model, auth views.
- `apps/core/`: Shared utilities, base tasks, middleware.
- `conf/`: Settings (`settings.py`, `test_settings.py`).

### Development Commands (Docker)
*Always run backend commands inside the container.*
```bash
make up              # Start all services
make shell           # Django shell
make test            # Run tests (pytest)
# Or manual docker exec:
docker compose exec backend python manage.py migrate
```

---

## 2. Frontend Architecture (TanStack Start)

### Tech Stack
- **Framework**: TanStack Start (SSR/ISR capable) with Vite & Nitro.
- **Routing**: File-based routing in `frontend/src/routes`.
- **State**: `@tanstack/react-store` for global state.
- **Forms**: `@tanstack/react-form` + `zod` validation.
- **Styling**: Tailwind CSS v4 (no config file, CSS-based), `clsx`, `tailwind-merge`.
- **Linting**: Biome (`biome.json`).

### Project Structure
```
frontend/
├── src/
│   ├── routes/          # File-based routes (e.g., index.tsx, __root.tsx)
│   ├── components/
│   │   ├── ui/          # Reusable UI components (Shadcn-like)
│   │   └── ...
│   ├── lib/             # Utilities (utils.ts has cn helper)
│   ├── hooks/           # Custom hooks
│   └── styles.css       # Tailwind v4 imports
├── biome.json           # Linter/Formatter config
└── vite.config.ts       # Vite + TanStack Start config
```

### Key Patterns
- **Routing**: Create new pages in `src/routes/`. Use `createFileRoute` for type-safe params.
- **Data Fetching**: Use TanStack Query (integrated into Start) or Server Functions (`.ts` files with `"use server"` if applicable in this setup).
- **Components**: Use `cn()` utility for class merging.
- **Forms**: Use `useForm` from `@tanstack/react-form`.

### Development Commands (Local)
```bash
cd frontend
bun install          # Install dependencies
bun dev              # Start dev server (port 3000)
bun run build        # Build for production
bun run check        # Run Biome lint/format check
```

---

## 3. Integration & Workflows

### API Communication
- Frontend proxies requests or calls backend URL directly (check `vite.config.ts` or env vars).
- Ensure Backend is running (`make up`) before developing Frontend.

### Testing
- **Backend**: `pytest` (in Docker).
- **Frontend**: `vitest` (via `bun test`).

### Common Pitfalls
- **Backend**: Do not use `username` field; use `email`.
- **Frontend**: Tailwind v4 uses CSS variables and `@theme` blocks in CSS, not `tailwind.config.js`.
- **Frontend**: Use `biome` for formatting, not Prettier/ESLint.
