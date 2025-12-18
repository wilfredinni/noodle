from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from apps.users.models import CustomUser as User
from unittest.mock import patch, ANY
import logging
from django.core.cache import cache


class LoginViewTests(APITestCase):
    """Test suite for the user login view"""

    @classmethod
    def setUpTestData(cls):
        cls.url = reverse("users:knox_login")
        cls.user = User.objects.create_user(
            email="testuser@example.com", password="testpassword123"
        )
        cls.valid_credentials = {
            "email": "testuser@example.com",
            "password": "testpassword123",
        }

    def test_login_success(self):
        """Test successful user login with token response"""
        with patch.object(logging.Logger, "info") as mock_logger:
            response = self.client.post(self.url, self.valid_credentials, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

            # Verify token response structure
            self.assertIn("expiry", response.data)
            self.assertIn("token", response.data)
            self.assertIn("user", response.data)

            # Verify user data in response
            user_data = response.data["user"]
            self.assertEqual(user_data["email"], self.user.email)
            mock_logger.assert_called_once()

    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        invalid_cases = [
            {"email": "wrong@example.com", "password": "wrongpassword"},  # Wrong both
            {"email": self.user.email, "password": "wrongpassword"},  # Correct email
            {
                "email": "wrong@example.com",
                "password": self.valid_credentials["password"],
            },
        ]

        for invalid_data in invalid_cases:
            with self.subTest(data=invalid_data):
                with patch.object(logging.Logger, "warning") as mock_logger:
                    response = self.client.post(self.url, invalid_data, format="json")
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                    self.assertIn("non_field_errors", response.data)
                    # Should have two log calls:
                    # 1. For the failed login attempt (email/IP)
                    # 2. For the Bad Request response
                    self.assertEqual(mock_logger.call_count, 2)
                    self.assertEqual(
                        mock_logger.call_args_list[0][0][0],
                        "Failed login attempt for email: " f"{invalid_data['email']}",
                    )
                    self.assertEqual(
                        mock_logger.call_args_list[1][0],
                        (
                            "%s: %s",
                            "Bad Request",
                            self.url,
                        ),
                    )
                    self.assertEqual(
                        mock_logger.call_args_list[1][1],
                        {
                            "extra": {"status_code": 400, "request": ANY},
                            "exc_info": None,
                        },
                    )

    def test_login_inactive_user(self):
        """Test login attempt for inactive user"""
        self.user.is_active = False
        self.user.save()
        with patch.object(logging.Logger, "warning") as mock_logger:
            response = self.client.post(self.url, self.valid_credentials, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("non_field_errors", response.data)
            # Should have two log calls:
            # 1. For the failed login attempt (email/IP)
            # 2. For the Bad Request response
            self.assertEqual(mock_logger.call_count, 2)
            self.assertEqual(
                mock_logger.call_args_list[0][0][0],
                "Failed login attempt for email: " f"{self.user.email}",
            )
            self.assertEqual(
                mock_logger.call_args_list[1][0],
                (
                    "%s: %s",
                    "Bad Request",
                    self.url,
                ),
            )
            self.assertEqual(
                mock_logger.call_args_list[1][1],
                {"extra": {"status_code": 400, "request": ANY}, "exc_info": None},
            )

    def test_login_missing_fields(self):
        """Test login with missing required fields"""
        required_fields = ["email", "password"]

        for field in required_fields:
            with self.subTest(field=field):
                data = self.valid_credentials.copy()
                data.pop(field)
                with patch.object(logging.Logger, "warning") as mock_logger:
                    response = self.client.post(self.url, data, format="json")
                    self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                    self.assertIn(field, response.data)
                    mock_logger.assert_called_once_with(
                        "%s: %s",
                        "Bad Request",
                        self.url,
                        extra={"status_code": 400, "request": ANY},
                        exc_info=None,
                    )

    def test_login_invalid_methods(self):
        """Test that only POST method is allowed"""
        methods = ["get", "put", "patch", "delete"]

        for method in methods:
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )
                self.assertIn("POST", response["Allow"])

    def test_login_throttling(self):
        """Test that login attempts are rate limited"""
        from apps.users.throttles import UserLoginRateThrottle

        # Create a test throttle class with very low rate for testing
        class TestLoginThrottle(UserLoginRateThrottle):
            rate = "1/minute"
            cache = cache  # Use default cache instead of throttle cache

            def get_cache_key(self, request, view):
                # Use a consistent test key
                return "throttle_login_test_key"

        # Clear any existing throttle state
        cache.delete("throttle_login_test_key")

        # Patch the view's throttle classes
        with patch("apps.users.views.LoginView.throttle_classes", [TestLoginThrottle]):
            # First request should succeed
            response = self.client.post(self.url, self.valid_credentials, format="json")
            self.assertEqual(response.status_code, status.HTTP_200_OK)

            # Second request should be throttled
            response = self.client.post(self.url, self.valid_credentials, format="json")
            self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_login_response_headers(self):
        """Test login response headers and content type"""
        response = self.client.post(self.url, self.valid_credentials, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertTrue(response["X-Frame-Options"] == "DENY")
        self.assertTrue(response["X-Content-Type-Options"] == "nosniff")

    def test_concurrent_login(self):
        """Test that multiple concurrent logins work correctly"""
        # Create multiple tokens for same user
        tokens = []
        for _ in range(3):
            response = self.client.post(self.url, self.valid_credentials, format="json")
            tokens.append(response.data["token"])

        # All tokens should be valid
        for token in tokens:
            self.client.credentials(HTTP_AUTHORIZATION=f"Token {token}")
            profile_url = reverse("users:profile")
            response = self.client.get(profile_url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
