# Database Seeding

Database seeding is the process of populating a database with initial data. This is particularly useful during development and testing phases to ensure your application has realistic data to work with, without having to manually create it.

## Why Use Database Seeding?

*   **Development**: Provides a quick way to set up a development environment with sample data, allowing developers to immediately start working on features without worrying about data entry.
*   **Testing**: Ensures that your tests run against a consistent and representative dataset, making your tests more reliable and reproducible.
*   **Demonstrations**: Useful for populating a database for demonstrations or presentations of your application.

## The `seed` Management Command

This project includes a powerful custom Django management command, `seed`, located at `apps/core/management/commands/seed.py`. This command allows you to easily populate your database with sample user data.

### Usage

To use the `seed` command with Docker Compose:

```bash
docker compose exec backend python manage.py seed [options]
```

Or if running locally:

```bash
python manage.py seed [options]
```

### Available Options

The `seed` command supports the following arguments:

*   `--users <count>`: Specifies the number of fake users to create. If not provided, it defaults to 10 users.

    *   **Example:** `docker compose exec backend python manage.py seed --users 50` (Creates 50 fake users)

*   `--superuser`: A flag that, when present, creates a superuser with predefined credentials (`admin@admin.com` / `admin`).

    *   **Example:** `python manage.py seed --superuser` (Creates an admin user)

*   `--clean`: A flag that, when present, deletes all existing non-superuser user data from the database before seeding. This is useful for starting with a fresh dataset.

    *   **Example:** `python manage.py seed --clean` (Deletes existing data before seeding)

### Combined Examples

You can combine these options to achieve specific seeding scenarios:

*   **Basic seeding with default options (creates 10 users):**

    ```bash
    python manage.py seed
    ```

*   **Create specific number of users and a superuser:**

    ```bash
    python manage.py seed --users 20 --superuser
    ```

*   **Clean existing data, create 50 users, and a superuser:**

    ```bash
    python manage.py seed --users 50 --superuser --clean
    ```

## Implementation Details

The `seed` command uses the `Faker` library to generate realistic-looking fake data for user profiles. It also utilizes Django's `transaction.atomic` decorator to ensure that the seeding process is atomic; if any part of the seeding fails, the entire operation is rolled back, preventing partial data corruption.
