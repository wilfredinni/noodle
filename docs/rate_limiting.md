# Rate Limiting

Rate limiting is a crucial security and performance feature that controls the number of requests a user or IP address can make to your API within a given timeframe. It helps prevent abuse, brute-force attacks, and ensures fair usage of your API resources.

## Why Use Rate Limiting?

*   **Security**: Protects against brute-force attacks on login endpoints, denial-of-service (DoS) attacks, and excessive data scraping.
*   **Performance**: Prevents a single user or malicious actor from overwhelming your server with too many requests, ensuring the API remains responsive for all legitimate users.
*   **Fair Usage**: Ensures that API resources are distributed fairly among all users, preventing any single user from monopolizing resources.

## How it's Implemented

This project uses Django REST Framework's built-in throttling mechanisms, along with a custom throttle class, to implement rate limiting.

### 1. Default Throttle Rates

Global throttle rates are defined in `conf/settings.py` under the `REST_FRAMEWORK` dictionary. These rates are applied based on different scopes:

```python
# Example from conf/settings.py
REST_FRAMEWORK = {
    # ... other settings
    "DEFAULT_THROTTLE_RATES": {
        "user": "1000/day",
        "anon": "100/day",
        "user_login": "5/minute",
    },
}
```

*   `user`: Applies to authenticated users. **Default:** `1000 requests per day`.
*   `anon`: Applies to unauthenticated (anonymous) users. **Default:** `100 requests per day`.
*   `user_login`: A custom scope specifically for login attempts. **Default:** `5 requests per minute`.

### 2. Custom Throttle Class

For specific scenarios, like limiting login attempts, a custom throttle class (`apps/users/throttles.py`) is used. This allows for more granular control over how requests are identified and limited.

```python
# Example from apps/users/throttles.py
from rest_framework.throttling import SimpleRateThrottle

class UserLoginRateThrottle(SimpleRateThrottle):
    scope = "user_login"

    def get_cache_key(self, request, view):
        if not request.user.is_authenticated:
            ident = self.get_ident(request) # Uses IP for anonymous users
        else:
            ident = request.user.pk # Uses user ID for authenticated users

        return self.cache_format % {"scope": self.scope, "ident": ident}
```

This custom throttle ensures that:

*   For anonymous users, rate limiting is based on their IP address.
*   For authenticated users, rate limiting is based on their user ID.

### 3. Applying Throttles to Views

Throttles are applied to DRF views using the `throttle_classes` attribute. This tells DRF which throttle policies to enforce for that specific view.

**Example (from `apps/users/views.py` for `LoginView` and `UserProfileView`):**

```python
# For LoginView
from rest_framework.throttling import AnonRateThrottle # Or other built-in throttles
from .throttles import UserLoginRateThrottle

class LoginView(KnoxLoginView):
    # ...
    throttle_classes = [UserLoginRateThrottle]

# For UserProfileView and CreateUserView
from rest_framework import throttling

class UserProfileView(generics.RetrieveUpdateAPIView):
    # ...
    throttle_classes = [throttling.UserRateThrottle]

class CreateUserView(generics.CreateAPIView):
    # ...
    throttle_classes = [throttling.UserRateThrottle]
```

*   `UserLoginRateThrottle`: Applied to the `LoginView` to limit login attempts.
*   `throttling.UserRateThrottle`: A built-in DRF throttle that applies the `user` scope rate (from `DEFAULT_THROTTLE_RATES`) to authenticated users. This is used for `UserProfileView` and `CreateUserView`.

## How to Configure

To adjust the rate limits for your API, modify the `DEFAULT_THROTTLE_RATES` dictionary in `conf/settings.py`.

For example, to change the anonymous user rate limit to 50 requests per hour:

```python
# In conf/settings.py
REST_FRAMEWORK = {
    # ...
    "DEFAULT_THROTTLE_RATES": {
        "user": "1000/day",
        "anon": "50/hour", # Changed from 100/day
        "user_login": "5/minute",
    },
}
```

You can also create new custom throttle classes in `apps/users/throttles.py` (or a similar location) and apply them to specific views as needed.
