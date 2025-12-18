from django.core.management.base import BaseCommand
from django.db import transaction
from faker import Faker
from apps.users.models import CustomUser

fake = Faker()


class Command(BaseCommand):
    help = "Seed database with sample data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--users", default=10, type=int, help="The number of fake users to create"
        )
        parser.add_argument(
            "--superuser",
            action="store_true",
            help="Create a superuser with email admin@admin.com and password admin",
        )
        parser.add_argument(
            "--clean", action="store_true", help="Delete all data before seeding"
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["clean"]:
            self.stdout.write("Deleting old data...")
            CustomUser.objects.filter(is_superuser=False).delete()

        if options["superuser"]:
            self.create_superuser()

        self.create_users(options["users"])

        self.stdout.write(self.style.SUCCESS("Successfully seeded database"))

    def create_superuser(self):
        try:
            superuser = CustomUser.objects.create_superuser("admin@admin.com", "admin")
            self.stdout.write(
                self.style.SUCCESS(f"Superuser created - {superuser.email}")
            )
        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Superuser already exists - {e}"))

    def create_users(self, count):
        self.stdout.write(f"Creating {count} users...")

        for _ in range(count):
            try:
                user = CustomUser.objects.create_user(
                    email=fake.email(),
                    password="testpass123",
                    first_name=fake.first_name(),
                    last_name=fake.last_name(),
                )
                self.stdout.write(f"Created user - {user.email}")
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"Error creating user - {e}"))
