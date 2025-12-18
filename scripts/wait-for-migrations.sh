#!/bin/sh
# Wait for database migrations to complete before starting Celery services

echo "Waiting for database to be ready..."
until python manage.py migrate --check > /dev/null 2>&1; do
    echo "Migrations not ready, waiting..."
    sleep 2
done

echo "Database migrations are ready!"
exec "$@"
