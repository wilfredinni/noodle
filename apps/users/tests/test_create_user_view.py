from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from unittest.mock import patch
import logging


class CreateUserViewTests(APITestCase):
    """Test suite for the create user view"""

    @classmethod
    def setUpTestData(cls):
        cls.url = reverse("users:create")
        cls.user_data = {
            "email": "testuser@example.com",
            "password": "testpassword123",
            "password2": "testpassword123",
        }
        cls.admin_user = get_user_model().objects.create_superuser(
            email="admin@example.com", password="adminpassword"
        )

    def test_create_user_success(self):
        """Test successfully creating a new user"""
        self.client.force_authenticate(user=self.admin_user)
        with patch.object(logging.Logger, "info") as mock_logger:
            response = self.client.post(self.url, self.user_data, format="json")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            self.assertTrue(
                get_user_model().objects.filter(email=self.user_data["email"]).exists()
            )
            mock_logger.assert_called_once()

    def test_create_user_password_mismatch(self):
        """Test creating user with mismatched passwords"""
        self.client.force_authenticate(user=self.admin_user)
        data = self.user_data.copy()
        data["password2"] = "differentpassword"
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(
            response.data["non_field_errors"][0], "Passwords do not match."
        )

    def test_create_user_weak_password(self):
        """Test creating user with weak password"""
        self.client.force_authenticate(user=self.admin_user)
        weak_passwords = [
            "1234567",  # Too short (7 chars)
            "password",  # Common password
            "12345678",  # All numeric
            self.user_data["email"].split("@")[0] + "123",  # Contains email username
        ]

        for password in weak_passwords:
            with self.subTest(password=password):
                data = self.user_data.copy()
                data["password"] = data["password2"] = password
                response = self.client.post(self.url, data, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("password", response.data)

    def test_create_user_duplicate_email(self):
        """Test creating user with duplicate email"""
        self.client.force_authenticate(user=self.admin_user)
        # Create first user
        self.client.post(self.url, self.user_data, format="json")
        # Try to create same user again
        response = self.client.post(self.url, self.user_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_create_user_missing_fields(self):
        """Test creating user with missing required fields"""
        self.client.force_authenticate(user=self.admin_user)
        required_fields = ["email", "password", "password2"]

        for field in required_fields:
            with self.subTest(field=field):
                data = self.user_data.copy()
                data.pop(field)
                response = self.client.post(self.url, data, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_create_user_invalid_email(self):
        """Test creating user with invalid email format"""
        self.client.force_authenticate(user=self.admin_user)
        data = self.user_data.copy()
        data["email"] = "not-an-email"
        response = self.client.post(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_create_user_unauthorized(self):
        """Test creating user without authentication"""
        response = self.client.post(self.url, self.user_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_user_invalid_methods(self):
        """Test that only POST method is allowed"""
        self.client.force_authenticate(user=self.admin_user)
        methods = ["get", "put", "patch", "delete"]

        for method in methods:
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )
