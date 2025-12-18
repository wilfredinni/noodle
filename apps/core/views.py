import logging

from django.http import JsonResponse
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.throttling import AnonRateThrottle


class PingRateThrottle(AnonRateThrottle):
    rate = "10/minute"


@extend_schema(
    description="Handles a ping request to check if the server is responsive.",
    responses={
        200: {
            "type": "object",
            "properties": {"ping": {"type": "string"}},
            "example": {"ping": "pong"},
        },
        405: {
            "type": "object",
            "properties": {"detail": {"type": "string"}},
            "example": {"detail": 'Method "POST" not allowed.'},
        },
    },
)
@api_view(["GET"])
@throttle_classes([PingRateThrottle])
def ping(request):
    logger = logging.getLogger("django.info")
    logger.info("Ping request received")
    return JsonResponse({"ping": "pong"})
