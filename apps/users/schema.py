from drf_spectacular.utils import OpenApiExample, OpenApiResponse

from apps.core.schema import UNAUTHORIZED_EXAMPLES, ErrorResponseSerializer

from .serializers import (
    CreateUserSerializer,
    LoginResponseSerializer,
    UserProfileSerializer,
)

LOGIN_RESPONSE_SCHEMA = {
    200: OpenApiResponse(
        response=LoginResponseSerializer,
        description="Successfully authenticated",
    ),
    400: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Invalid credentials",
        examples=[
            OpenApiExample(
                "Invalid Credentials",
                value={"detail": "Unable to log in with provided credentials."},
                status_codes=["400"],
            ),
            OpenApiExample(
                "Missing Fields",
                value={
                    "email": ["This field is required."],
                    "password": ["This field is required."],
                },
                status_codes=["400"],
            ),
        ],
    ),
}

USER_CREATE_RESPONSE_SCHEMA = {
    201: OpenApiResponse(
        response=CreateUserSerializer,
        description="User successfully created",
    ),
    400: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Validation error",
        examples=[
            OpenApiExample(
                "Invalid Data",
                value={
                    "email": ["This email is already registered."],
                    "password": ["Passwords do not match."],
                },
                status_codes=["400"],
            ),
            OpenApiExample(
                "Bad Request",
                value={
                    "email": ["This field may not be blank."],
                    "password": ["This field may not be blank."],
                    "password2": ["This field may not be blank."],
                },
                status_codes=["400"],
            ),
        ],
    ),
    401: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Authentication required",
        examples=UNAUTHORIZED_EXAMPLES,
    ),
}

PROFILE_DETAIL_SCHEMA = {
    200: OpenApiResponse(
        response=UserProfileSerializer,
        description="User profile data",
    ),
    401: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Authentication required",
        examples=UNAUTHORIZED_EXAMPLES,
    ),
}

PROFILE_PUT_SCHEMA = {
    200: OpenApiResponse(
        response=UserProfileSerializer,
        description="User profile updated",
    ),
    400: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Validation error",
        examples=[
            OpenApiExample(
                "Invalid Data",
                value={"password": ["Password must be at least 5 characters long."]},
                status_codes=["400"],
            ),
            OpenApiExample(
                "Missing Fields",
                value={"password": ["This field is required."]},
                status_codes=["400"],
            ),
        ],
    ),
    401: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Authentication required",
        examples=UNAUTHORIZED_EXAMPLES,
    ),
}

PROFILE_PATCH_SCHEMA = {
    200: OpenApiResponse(
        response=UserProfileSerializer,
        description="User profile updated",
    ),
    401: OpenApiResponse(
        response=ErrorResponseSerializer,
        description="Authentication required",
        examples=UNAUTHORIZED_EXAMPLES,
    ),
}
