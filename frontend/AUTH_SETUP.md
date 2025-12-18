# Authentication Setup

## Overview
Frontend authentication is now configured to work with the Django backend using Better Auth library with custom Django adapter.

## Features
- ✅ Sign-in page at `/signin`
- ✅ Django Knox token authentication
- ✅ Session management with localStorage
- ✅ Protected routes
- ✅ User profile display
- ✅ Sign out functionality

## Setup

### 1. Environment Variables
Create a `.env` file in the `frontend` directory:

```bash
VITE_API_URL=http://localhost:8000
```

### 2. Start Backend
```bash
make up  # From project root
```

### 3. Start Frontend
```bash
cd frontend
bun install
bun dev
```

## Usage

### Sign In
1. Navigate to `http://localhost:3000/signin`
2. Enter your email and password
3. Click "Sign In"
4. You'll be redirected to the dashboard

### Authentication Flow
1. User enters credentials on sign-in page
2. Frontend sends POST request to Django `/api/users/login/`
3. Django validates credentials and returns Knox token
4. Token is stored in localStorage
5. Token is sent with all subsequent requests via `Authorization: Bearer <token>` header

### Files Created
- `frontend/src/lib/auth-client.ts` - Better Auth client with Django adapter
- `frontend/src/routes/signin.tsx` - Sign-in page
- `frontend/src/hooks/useAuth.ts` - Authentication hook
- `frontend/.env` - Environment configuration

### API Endpoints Used
- `POST /api/users/login/` - Sign in
- `POST /api/users/logout/` - Sign out
- `GET /api/users/profile/` - Get current user

## Security Notes
- Tokens are stored in localStorage
- All authenticated requests include the Bearer token
- Tokens are removed on logout
- Session validation on page load
