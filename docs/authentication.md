# Authentication System

## Overview

This section provides a comprehensive guide to the authentication system implemented in the Django Starter Template. It covers the core authentication endpoints, security settings, and how token-based authentication is managed.

## Authentication Settings

The following settings in `conf/settings.py` are relevant to authentication and user management:

*   `AUTH_USER_MODEL`: Specifies the custom user model to use. **Default:** `users.CustomUser`. This allows you to extend Django's default user model with custom fields and behaviors.

*   `MIN_PASSWORD_LENGTH`: Minimum length for user passwords. **Default:** `8` (loaded from `env.int("MIN_PASSWORD_LENGTH", default=8)`). This is used by the password validation system.

*   `PASSWORD_HASHERS`: A list of password hashing algorithms used for storing user passwords. **Default:** A list including `ScryptPasswordHasher`, `PBKDF2PasswordHasher`, `PBKDF2SHA1PasswordHasher`, `Argon2PasswordHasher`, and `BCryptSHA256PasswordHasher`. This provides strong password security.

*   `AUTH_PASSWORD_VALIDATORS`: Configures password validation rules. **Default:** Includes validators for user attribute similarity, minimum length, common passwords, and numeric passwords. You can customize these to enforce stronger password policies.

### Token-Based Authentication

The template uses `django-rest-knox` for secure, token-based authentication. This system provides a robust way to manage authentication tokens for users. The following settings, configured under `REST_KNOX` in `conf/settings.py`, control its behavior:

*   `SECURE_HASH_ALGORITHM`: Specifies the hashing algorithm for tokens. **Default:** `hashlib.sha512`.
*   `AUTH_TOKEN_CHARACTER_LENGTH`: Defines the length of the authentication token. **Default:** `64`.
*   `TOKEN_TTL`: Sets the time-to-live for tokens, determining how long they remain valid. **Default:** `timedelta(hours=10)`.
*   `USER_SERIALIZER`: Indicates the serializer used for user profiles. **Default:** `apps.users.serializers.UserProfileSerializer`.
*   `TOKEN_LIMIT_PER_USER`: Allows limiting the number of active tokens a single user can have. **Default:** `None` (no limit).
*   `AUTO_REFRESH`: Controls whether tokens are automatically refreshed upon use. **Default:** `False`.
*   `AUTO_REFRESH_MAX_TTL`: Sets the maximum time-to-live for auto-refreshed tokens. **Default:** `None`.
*   `MIN_REFRESH_INTERVAL`: Defines the minimum interval between token refreshes in seconds. **Default:** `60` seconds.
*   `AUTH_HEADER_PREFIX`: Specifies the prefix for the Authorization header (e.g., `Bearer`). **Default:** `Bearer`.
*   `TOKEN_MODEL`: Refers to the token model used by Knox. **Default:** `knox.AuthToken`.

### REST Framework Settings

Django REST Framework (DRF) settings, particularly authentication classes and throttle rates, are configured to manage API access and prevent abuse:

*   `DEFAULT_AUTHENTICATION_CLASSES`: Defines the authentication methods available for API endpoints. **Default:** `knox.auth.TokenAuthentication`. In `DEBUG` mode, `SessionAuthentication` and `BasicAuthentication` are also enabled for convenience.

*   `DEFAULT_THROTTLE_RATES`: Configures rate limiting to control the number of requests users can make within a given timeframe. **Default:**
    *   `user: "1000/day"` (authenticated users)
    *   `anon: "100/day"` (unauthenticated users)
    *   `user_login: "5/minute"` (specific throttle for login attempts)

These rates can be adjusted in `conf/settings.py` to suit your application's specific needs and security requirements.

## Authentication Endpoints

### Create User

This endpoint allows for the registration of a new user account.

**Request:**

*   **Method:** `POST`
*   **URL:** `/auth/create/`
*   **Body:**
    ```json
    {
        "email": "user@example.com",
        "password": "complexpassword123",
        "password2": "complexpassword123"
    }
    ```
    *   `email`: The user's unique email address.
    *   `password`: The user's chosen password.
    *   `password2`: Confirmation of the user's chosen password (must match `password`).

**Responses:**

*   **Success (201 Created):**
    ```json
    {
        "email": "user@example.com"
    }
    ```
    *   Returns the email of the newly created user.

*   **Error (400 Bad Request):**
    *   **Passwords do not match:**
        ```json
        {
            "password": [
                "Passwords do not match."
            ]
        }
        ```
    *   **Email already registered:**
        ```json
        {
            "email": [
                "This email is already registered."
            ]
        }
        ```
    *   **Invalid password (e.g., too short, common password):**
        ```json
        {
            "password": [
                "This password is too short. It must contain at least 8 characters."
            ]
        }
        ```
*   **Error (401 Unauthorized):**
    *   This error typically occurs if authentication credentials are required for this endpoint (though usually not for user creation).
    ```json
    {
        "detail": "Authentication credentials were not provided."
    }
    ```

### Login

This endpoint authenticates a user and issues an authentication token.

**Request:**

*   **Method:** `POST`
*   **URL:** `/auth/login/`
*   **Body:**
    ```json
    {
        "email": "user@example.com",
        "password": "complexpassword123"
    }
    ```
    *   `email`: The user's registered email address.
    *   `password`: The user's password.

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "expiry": "2025-07-09T12:00:00Z",
        "token": "your-auth-token",
        "user": {
            "email": "user@example.com",
            "first_name": "",
            "last_name": ""
        }
    }
    ```
    *   `expiry`: The expiration timestamp of the token.
    *   `token`: The authentication token to be used in subsequent requests.
    *   `user`: A dictionary containing basic user profile information.

*   **Error (400 Bad Request):**
    *   **Invalid credentials:**
        ```json
        {
            "detail": "Unable to log in with provided credentials."
        }
        ```
    *   **Missing fields:**
        ```json
        {
            "email": [
                "This field is required."
            ],
            "password": [
                "This field is required."
            ]
        }
        ```

### Logout

This endpoint logs out the currently authenticated user by invalidating their current authentication token.

**Request:**

*   **Method:** `POST`
*   **URL:** `/auth/logout/`
*   **Authentication:** Token required.

**Responses:**

*   **Success (204 No Content):**
    *   The response will have an empty body, indicating successful token invalidation.

*   **Error (401 Unauthorized):**
    *   Occurs if no authentication credentials are provided or if the token is invalid.
    ```json
    {
        "detail": "Authentication credentials were not provided."
    }
    ```

### Logout All
This endpoint invalidates all authentication tokens for the currently authenticated user, effectively logging them out from all devices.

**Request:**

*   **Method:** `POST`
*   **URL:** `/auth/logoutall/`
*   **Authentication:** Token required.

**Responses:**

*   **Success (204 No Content):**
    *   The response will have an empty body, indicating that all tokens for the user have been invalidated.

*   **Error (401 Unauthorized):**
    *   Occurs if no authentication credentials are provided or if the token is invalid.
    ```json
    {
        "detail": "Authentication credentials were not provided."
    }
    ```

### User Profile

This endpoint allows authenticated users to retrieve and update their profile information.

#### Retrieve User Profile

Retrieves the profile of the currently authenticated user.

**Request:**

*   **Method:** `GET`
*   **URL:** `/auth/profile/`
*   **Authentication:** Token required.

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "email": "user@example.com",
        "first_name": "John",
        "last_name": "Doe"
    }
    ```
    *   Returns the user's email, first name, and last name.

*   **Error (401 Unauthorized):**
    *   Occurs if no authentication credentials are provided or if the token is invalid.
    ```json
    {
    "detail": "Authentication credentials were not provided."
}
    ```

#### Update User Profile

Updates the entire profile of the currently authenticated user. All fields must be provided.

**Request:**

*   **Method:** `PUT`
*   **URL:** `/auth/profile/`
*   **Authentication:** Token required.
*   **Body:**
    ```json
    {
        "first_name": "Jane",
        "last_name": "Doe"
    }
    ```
    *   `first_name`: The user's first name.
    *   `last_name`: The user's last name.

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "email": "user@example.com",
        "first_name": "Jane",
        "last_name": "Doe"
    }
    ```
    *   Returns the updated user profile.

*   **Error (400 Bad Request):**
    *   Occurs if the provided data is invalid (e.g., password validation errors if password fields were included).
    ```json
    {
        "password": [
            "Password must be at least 8 characters long."
        ]
    }
    ```

*   **Error (401 Unauthorized):**
    *   Occurs if no authentication credentials are provided or if the token is invalid.
    ```json
    {
    "detail": "Authentication credentials were not provided."
}
    ```

#### Partially Update User Profile

Partially updates the profile of the currently authenticated user. Only the fields to be updated need to be provided.

**Request:**

*   **Method:** `PATCH`
*   **URL:** `/auth/profile/`
*   **Authentication:** Token required.
*   **Body:**
    ```json
    {
        "first_name": "Jane"
    }
    ```
    *   `first_name`: The user's first name (optional).
    *   `last_name`: The user's last name (optional).

**Responses:**

*   **Success (200 OK):**
    ```json
    {
        "email": "user@example.com",
        "first_name": "Jane",
        "last_name": "Doe"
    }
    ```
    *   Returns the partially updated user profile.

*   **Error (401 Unauthorized):**
    *   Occurs if no authentication credentials are provided or if the token is invalid.
    ```json
    {
    "detail": "Authentication credentials were not provided."
}
    ```