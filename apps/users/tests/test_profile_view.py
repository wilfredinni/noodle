from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model


class ProfileViewTests(APITestCase):
    """Test suite for the user profile view"""

    @classmethod
    def setUpTestData(cls):
        cls.url = reverse("users:profile")
        cls.user = get_user_model().objects.create_user(
            email="testuser@example.com",
            password="testpassword123",
            first_name="Test",
            last_name="User",
        )
        cls.valid_update_data = {
            "first_name": "Updated",
            "last_name": "Name",
            "password": "newpassword123",
        }

    def test_retrieve_profile_success(self):
        """Test successfully retrieving user profile"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], self.user.email)
        self.assertEqual(response.data["first_name"], self.user.first_name)
        self.assertEqual(response.data["last_name"], self.user.last_name)

    def test_update_profile_put(self):
        """Test full profile update with PUT"""
        self.client.force_authenticate(user=self.user)
        # PUT requires all fields - include email in the update
        data = {
            "email": "testuser@example.com",  # Must include existing email
            "first_name": "Updated",
            "last_name": "Name",
            "password": "newpassword123",
        }
        response = self.client.put(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.last_name, "Name")
        self.assertTrue(self.user.check_password("newpassword123"))

    def test_update_profile_patch(self):
        """Test partial profile update with PATCH"""
        self.client.force_authenticate(user=self.user)
        data = {"first_name": "Patched"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Patched")
        self.assertEqual(self.user.last_name, "User")  # Unchanged

    def test_update_profile_invalid_data(self):
        """Test profile update with invalid data"""
        self.client.force_authenticate(user=self.user)
        invalid_data = {"email": "not-an-email"}
        response = self.client.put(self.url, invalid_data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_profile_unauthorized_access(self):
        """Test unauthorized profile access"""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_profile_invalid_methods(self):
        """Test that DELETE method is not allowed"""
        self.client.force_authenticate(user=self.user)
        methods = ["delete"]

        for method in methods:
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.url)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )

    def test_password_validation_success(self):
        """Test successful password update with valid password"""
        self.client.force_authenticate(user=self.user)
        data = {"email": "testuser@example.com", "password": "ValidPass123!"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("ValidPass123!"))

    def test_password_too_short(self):
        """Test password update with too short password"""
        self.client.force_authenticate(user=self.user)
        data = {"email": "testuser@example.com", "password": "short"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertEqual(
            response.data["password"][0], "Ensure this field has at least 8 characters."
        )

    def test_numeric_only_password(self):
        """Test password update with numeric-only password"""
        self.client.force_authenticate(user=self.user)
        data = {"email": "testuser@example.com", "password": "12345678"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertTrue(
            any("entirely numeric" in msg for msg in response.data["password"]),
            "Expected entirely numeric password error not found",
        )

    def test_common_weak_password(self):
        """Test password update with common weak password"""
        self.client.force_authenticate(user=self.user)
        data = {"email": "testuser@example.com", "password": "password"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertTrue(
            any("too common" in msg for msg in response.data["password"]),
            "Expected password too common error not found",
        )

    def test_password_contains_email(self):
        """Test password update with password containing email"""
        self.client.force_authenticate(user=self.user)
        data = {"email": "testuser@example.com", "password": "testuser123"}
        response = self.client.patch(self.url, data, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertIn(
            "The password is too similar to the email address.",
            response.data["password"][0],
        )
