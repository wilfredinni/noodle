Write comprehensive model tests for Django applications adhering to the following specifications:

## Test Structure
- Organize tests in `tests/test_<model_name>.py` within each Django app
- Implement tests using pytest or Django TestCase
- Follow PEP 8 and Django coding standards

## Required Test Coverage

### 1. Field Validation
- Test all model field constraints:
  - Required fields (null/blank)
  - Field type validations
  - Length/range restrictions
  - Custom validators
  - Unique constraints
  - Index effectiveness

### 2. Relationships
- Validate ForeignKey constraints
- Test ManyToMany relationship behaviors
- Verify cascading operations
- Check related field access patterns

### 3. Data Operations
- Test CRUD operations
- Verify bulk operations performance
- Validate custom manager methods
- Test model-specific business logic
- Check complex queries and filters

### 4. Edge Cases
- Test boundary conditions
- Include negative test scenarios
- Validate error handling
- Check race conditions

### 5. Performance
- Benchmark query execution times
- Test with representative data volumes
- Verify index usage
- Monitor memory consumption

## Documentation
- Add descriptive docstrings
- Document test fixtures
- Explain complex test scenarios
- Reference expected behaviors

## References
- Django Testing Documentation: https://docs.djangoproject.com/en/stable/topics/testing/
- pytest-django: https://pytest-django.readthedocs.io/

Use appropriate fixtures and mocking strategies to ensure tests are isolated and repeatable.