Generate comprehensive test suite for Django REST framework API views following these requirements:

1. Test Location and Framework:
   - Place tests in the `tests` directory within each Django app
   - Use Pytest or Django/DRF TestCase as the testing framework
   - Follow the `test_<view_name>.py` naming convention

2. Authentication & Security Tests:
   - Verify authentication requirements for each endpoint
   - Test authorization rules and permissions
   - Validate rate limiting functionality
   - Test request throttling behavior

3. HTTP Method Coverage:
   - Test all CRUD operations: GET, POST, PUT, PATCH, DELETE
   - Verify correct HTTP status codes (200, 201, 204, 400, 401, 403, 404, etc.)
   - Include both successful and error scenarios
   - Test request payload validation

4. Response Validation:
   - Verify response structure and data types
   - Check serializer field validation
   - Test pagination if implemented
   - Validate filtering and sorting functionality

5. Documentation Requirements:
   - Include docstrings describing test purpose
   - Document test data and fixtures
   - Add comments for complex test scenarios

6. Edge Cases:
   - Test boundary conditions
   - Include negative testing scenarios
   - Verify error message formats

Reference Django REST framework testing documentation for best practices:
https://www.django-rest-framework.org/api-guide/testing/