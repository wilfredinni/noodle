class RequestIDFilter:
    """Mock filter for tests that adds a test request ID"""

    def filter(self, record):
        record.request_id = "test-request-id"
        return True


def mock_request_id(get_response):
    """Test utility to mock request ID generation"""

    def middleware(request):
        request.id = "test-request-id"
        return get_response(request)

    return middleware


# Test configuration
RequestIDMiddleware = mock_request_id
