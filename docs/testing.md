# Testing

This project uses `pytest` as its primary testing framework, integrated with `pytest-django` for seamless Django testing and `pytest-cov` for code coverage analysis. This setup ensures a robust and efficient testing environment.

## Testing Setup

### `pytest.ini` Configuration

The `pytest.ini` file in the project root configures `pytest` behavior:

```ini
[pytest]
DJANGO_SETTINGS_MODULE = conf.test_settings
python_files = tests.py test_*.py *_tests.py

addopts = --reuse-db --nomigrations --cov=. --cov-report=html --cov-report=term-missing --no-cov-on-fail
```

*   `DJANGO_SETTINGS_MODULE = conf.test_settings`: Specifies that `conf.test_settings.py` should be used for running tests. This file typically contains settings optimized for testing (e.g., using an in-memory database).
*   `python_files = tests.py test_*.py *_tests.py`: Defines the naming conventions for test files that `pytest` should discover.
*   `addopts`: Additional command-line options that are always passed to `pytest`:
    *   `--reuse-db`: Reuses the test database between test runs, significantly speeding up subsequent test executions.
    *   `--nomigrations`: Prevents Django from running migrations during tests, assuming your test database schema is up-to-date.
    *   `--cov=.`: Enables code coverage analysis for the entire project.
    *   `--cov-report=html`: Generates an HTML report for code coverage, providing a visual breakdown of covered and uncovered lines.
    *   `--cov-report=term-missing`: Displays missing coverage information directly in the terminal.
    *   `--no-cov-on-fail`: Prevents coverage reporting if tests fail.

### Test File Organization

Tests are organized by application within `tests/` directories. For example, tests for the `users` app are located in `apps/users/tests/`.

*   `apps/core/tests/`: Contains tests for core functionalities.
*   `apps/users/tests/`: Contains tests for user management and authentication.

This structure keeps tests co-located with the code they test, making it easier to find and maintain them.

## Running Tests

To run tests with Docker Compose, use `docker compose exec backend pytest`. The `pytest.ini` configuration will automatically apply the necessary options.

### Basic Test Run

To run all tests:

```bash
docker compose exec backend pytest
```

### Running Tests with Coverage

To run tests and generate a code coverage report:

```bash
docker compose exec backend pytest --cov
```

This will output a summary of code coverage in the terminal. To generate a detailed HTML report (which you can open in your browser for a visual representation of coverage):

```bash
docker compose exec backend pytest --cov --cov-report=html
```

The HTML report will be generated in the `htmlcov/` directory in your project root.

### Running Specific Tests

You can run specific test files or even individual test functions:

*   **Run tests in a specific file:**

    ```bash
    docker compose exec backend pytest apps/users/tests/test_user_model.py
    ```

*   **Run a specific test function:**

    ```bash
    docker compose exec backend pytest apps/users/tests/test_user_model.py::test_create_user
    ```

## Best Practices

*   **Test Coverage**: Aim for high test coverage, especially for critical business logic and API endpoints. The `--cov` option helps you track this.
*   **Fixtures**: Utilize `pytest` fixtures to set up common test data and environments, promoting reusability and reducing boilerplate code.
*   **Clear Naming**: Name your test files and functions clearly (e.g., `test_feature_name.py`, `test_function_behavior`) to make it easy to understand what each test covers.
*   **Isolation**: Ensure your tests are isolated and do not depend on the state of previous tests. Use `pytest-django`'s transactional test cases or database cleanup mechanisms.
