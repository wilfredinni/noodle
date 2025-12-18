import logging
import time
import uuid
from threading import local

_thread_locals = local()


def get_client_ip(request):
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    ip = (
        x_forwarded_for.split(",")[0].strip()
        if x_forwarded_for
        else request.META.get("REMOTE_ADDR", "")
    )
    return ip


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.id = str(uuid.uuid4())
        _thread_locals.request_id = request.id
        _thread_locals.client = get_client_ip(request)
        _thread_locals.path = request.path
        _thread_locals.user_id = (
            getattr(request.user, "id", None)
            if hasattr(request.user, "is_authenticated")
            and request.user.is_authenticated
            else None
        )

        start_time = time.time()
        response = self.get_response(request)
        response_time = time.time() - start_time

        _thread_locals.response_time = response_time
        _thread_locals.status_code = response.status_code
        response["X-Request-ID"] = request.id
        response["X-Response-Time"] = f"{response_time:.3f}s"
        return response


class TimeLogFilter(logging.Filter):
    def filter(self, record):
        response_time = getattr(_thread_locals, "response_time", None)
        if response_time is None:
            return False

        return True


class RequestIDFilter(logging.Filter):
    def filter(self, record):
        record.request_id = getattr(_thread_locals, "request_id", "none")
        record.client = getattr(_thread_locals, "client", "")
        record.path = getattr(_thread_locals, "path", "")
        record.user_id = getattr(_thread_locals, "user_id", "anonymous")
        record.response_time = getattr(_thread_locals, "response_time", 0)
        record.status_code = getattr(_thread_locals, "status_code", 0)
        return True
