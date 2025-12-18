from rest_framework.throttling import SimpleRateThrottle


class UserLoginRateThrottle(SimpleRateThrottle):
    """
    A rate throttle class for user login attempts.

    This class extends SimpleRateThrottle to implement rate limiting for login requests.
    It uses different identifiers for authenticated and unauthenticated users.

    Attributes:
        scope (str): The scope identifier for this throttle ("user_login")

    Methods:
        get_cache_key(request, view): Generates a unique cache key for rate limiting

    Args:
        request (HttpRequest): The request being throttled
        view (View): The view being accessed

    Returns:
        str: A unique cache key combining scope and user identifier

    Notes:
        - For authenticated users, the user's primary key is used as identifier
        - For unauthenticated users, the request's IP address is used as identifier
    """

    scope = "user_login"

    def get_cache_key(self, request, view):
        if not request.user.is_authenticated:
            ident = self.get_ident(request)
        else:
            ident = request.user.pk

        return self.cache_format % {"scope": self.scope, "ident": ident}
