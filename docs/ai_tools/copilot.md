# GitHub Copilot

This page provides detailed information and guidelines for using GitHub Copilot within this project.

## Technical Requirements and Communication Standards

This project adheres to specific technical requirements and communication standards for Django backend development when using GitHub Copilot:

**Framework & Core Dependencies:**
- Django 5.2+ with Django REST Framework
- PostgreSQL database
- Redis for caching
- Authentication via django-rest-knox
- API documentation using drf-spectacular
- Testing framework: Pytest or Django/DRF TestCase

**Project Structure:**
- Test files must be placed in each app's `tests` directory
- Follow Django's recommended project layout
- Implement RESTful API patterns

**Development Guidelines:**
1. All implementations must follow Django's best practices and security standards
2. Use Django REST Framework viewsets and serializers when building APIs
3. Implement proper authentication and permission checks using knox
4. Cache expensive operations using Redis
5. Document all APIs using OpenAPI/Swagger via drf-spectacular

**Testing Requirements:**
1. Write comprehensive unit tests for all features
2. Follow Pytest conventions and patterns
3. Achieve minimum test coverage as per project standards
4. Include both positive and negative test scenarios

**Documentation:**
1. Reference official Django and DRF documentation
2. Include docstrings for all classes and methods that have an important role
3. Document API endpoints using drf-spectacular decorators

**Response Format:**
1. Provide direct, implementation-focused answers
2. Highlight any missing information needed for implementation
3. Include code examples only when explicitly requested
4. Format code according to PEP 8 standards

- Utilize context7 MCP for current documentation when applicable

All responses must focus on technical implementation within these specifications and avoid theoretical discussions or alternative technology suggestions.



### Feature Prompt (`feature.prompt.md`)

**Purpose:** Use this prompt when you need to plan and implement a new feature. It guides Copilot to think about the feature's overview, impact, implementation plan, code, and integration strategy.

```markdown
As a professional developer, analyze and implement a new feature in the codebase following these guidelines:

1. Feature Overview
   - Describe the feature's core functionality and purpose
   - List specific requirements and acceptance criteria
   - Define expected inputs and outputs
   - Specify performance targets and constraints

2. Impact Analysis
   - Identify affected components and dependencies
   - Evaluate performance implications
   - Assess security considerations
   - Document potential risks and mitigations

3. Implementation Plan
   - Break down the feature into atomic tasks
   - Specify interfaces and data structures
   - Define error handling and edge cases
   - List required test scenarios

4. Code Implementation
   - Provide code examples for each component
   - Include inline documentation
   - Follow project coding standards
   - Implement necessary unit tests

5. Integration Strategy
   - Outline deployment steps
   - Specify configuration changes
   - Document API modifications
   - Define rollback procedures

Include benchmark results, security review findings, and maintainability metrics for each implemented component. Prioritize clean architecture and SOLID principles.
```

### Refactor Prompt (`refactor.prompt.md`)

**Purpose:** Use this prompt when you want to refactor existing code. It directs Copilot to focus on performance, security, maintainability, and readability, providing a structured approach to code improvement.

```markdown
As a senior software engineer, analyze the provided code and suggest specific refactoring improvements focusing on these key aspects:

1. Performance:
- Identify algorithmic inefficiencies
- Optimize resource usage and memory management
- Suggest caching strategies where applicable
- Highlight potential bottlenecks

2. Security:
- Review for common vulnerabilities (OWASP Top 10)
- Ensure proper input validation
- Verify authentication and authorization
- Check for secure data handling

3. Maintainability:
- Apply SOLID principles
- Improve code organization and structure
- Reduce technical debt
- Enhance modularity and reusability

4. Readability:
- Follow language-specific style guides
- Apply consistent naming conventions
- Add meaningful comments and documentation
- Break down complex logic into smaller functions

For each suggested improvement:
- Explain the rationale
- Provide a code example
- Highlight potential trade-offs
- Consider the impact on existing functionality

Please provide the code you want to refactor, and specify any constraints or requirements specific to your project's context.
```

### Security Prompt (`security.prompt.md`)

**Purpose:** Use this prompt to conduct a security review of your API implementation. It guides Copilot to check for authentication, authorization, input validation, rate limiting, and security monitoring.

```markdown
Conduct a comprehensive security review of the REST API implementation according to industry best practices. Review and implement the following security controls:

Authentication & Authorization:
- Verify JWT/OAuth2 authentication is properly implemented for all endpoints
- Confirm role-based access control (RBAC) is enforced
- Check token validation, expiration, and refresh mechanisms
- Ensure sensitive endpoints require appropriate scopes/permissions

Input Validation & Sanitization:
- Validate request parameters, headers, and body content
- Implement strong input validation using a schema validator (e.g. JSON Schema)
- Apply appropriate encoding for special characters
- Prevent SQL injection, XSS, and CSRF attacks

Rate Limiting & DDoS Protection:
- Set appropriate rate limits per endpoint/user
- Implement exponential backoff for failed attempts
- Configure API gateway throttling rules
- Document rate limit headers and responses

Security Monitoring:
- Enable detailed logging for authentication attempts
- Track and alert on suspicious activity patterns
- Log all administrative actions and data modifications
- Implement audit trails for sensitive operations
- Set up automated security scanning and penetration testing

Follow OWASP API Security Top 10 guidelines and document any findings in a security assessment report.

References:
- OWASP API Security Top 10: https://owasp.org/www-project-api-security/
- NIST Security Guidelines for Web Services
```

### Test Model Prompt (`test-model.prompt.md`)

**Purpose:** Use this prompt when writing tests for Django models. It ensures comprehensive test coverage for field validation, relationships, data operations, edge cases, and performance.

```markdown
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
```

### Test View Prompt (`test-view.prompt.md`)

**Purpose:** Use this prompt when writing tests for Django REST framework API views. It ensures comprehensive test coverage for authentication, security, HTTP methods, response validation, and edge cases.

```markdown
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
```

## Reusable Prompts

Specific reusable prompts for various tasks are located in the `.github/prompts/` directory of the repository:
*   `feature.prompt.md` - For planning and implementing new features
*   `refactor.prompt.md` - For code refactoring improvements
*   `security.prompt.md` - For security analysis and hardening
*   `test-model.prompt.md` - For model testing
*   `test-view.prompt.md` - For view testing