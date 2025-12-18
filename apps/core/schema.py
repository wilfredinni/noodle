from drf_spectacular.utils import OpenApiExample, inline_serializer
from rest_framework import serializers

ErrorResponseSerializer = inline_serializer(
    name="ErrorResponse",
    fields={
        "detail": serializers.CharField(read_only=True),
        "code": serializers.CharField(read_only=True, required=False),
    },
)

UNAUTHORIZED_EXAMPLES = [
    OpenApiExample(
        "Unauthorized",
        value={"detail": "Authentication credentials were not provided."},
        status_codes=["401"],
    ),
    OpenApiExample(
        "Invalid token",
        value={"detail": "Invalid token."},
        status_codes=["401"],
    ),
    OpenApiExample(
        "Invalid token header",
        value={"detail": "Invalid token header. No credentials provided."},
        status_codes=["401"],
    ),
]
