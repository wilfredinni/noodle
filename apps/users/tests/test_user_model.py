import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError


@pytest.mark.django_db
class TestUserModel:
    """Test suite for the CustomUser model"""

    @pytest.fixture
    def user(self):
        User = get_user_model()
        return User.objects.create_user(
            email="test@example.com", password="testpass123"
        )

    def test_create_user(self, user):
        """Test regular user creation"""
        assert user.email == "test@example.com"
        assert user.is_active
        assert not user.is_staff
        assert not user.is_superuser
        assert user.username is None
        assert user.check_password("testpass123")

    def test_create_user_empty_email(self):
        """Test user creation with empty email"""
        User = get_user_model()
        with pytest.raises(ValueError, match="The Email must be set"):
            User.objects.create_user(email="", password="foo")

    def test_email_normalization(self):
        """Test email is normalized before saving"""
        User = get_user_model()
        email = "Test@Example.COM"
        user = User.objects.create_user(email=email, password="foo")
        assert user.email == "Test@example.com"

    def test_email_uniqueness(self, user):
        """Test email uniqueness constraint"""
        User = get_user_model()
        with pytest.raises(IntegrityError):
            User.objects.create_user(email="test@example.com", password="anotherpass")

    def test_string_representation(self, user):
        """Test the __str__ method"""
        assert str(user) == user.email

    def test_create_superuser(self):
        """Test superuser creation"""
        User = get_user_model()
        admin_user = User.objects.create_superuser(
            email="admin@example.com", password="adminpass"
        )
        assert admin_user.email == "admin@example.com"
        assert admin_user.is_active
        assert admin_user.is_staff
        assert admin_user.is_superuser
        assert admin_user.check_password("adminpass")

    def test_create_superuser_invalid_flags(self):
        """Test superuser creation with invalid flags"""
        User = get_user_model()
        with pytest.raises(ValueError):
            User.objects.create_superuser(
                email="admin@example.com", password="adminpass", is_staff=False
            )
        with pytest.raises(ValueError):
            User.objects.create_superuser(
                email="admin@example.com", password="adminpass", is_superuser=False
            )

    def test_user_required_fields(self):
        """Test that email is the only required field"""
        User = get_user_model()
        assert User.REQUIRED_FIELDS == []
        assert User.USERNAME_FIELD == "email"
