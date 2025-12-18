from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _

from .managers import CustomUserManager


class CustomUser(AbstractUser):
    """
    CustomUser is a custom user model that extends Django's AbstractUser.
    It uses email as the unique identifier instead of the username.
    """

    # The username field is set to None to disable it.
    username = None

    # The email field is set to be unique because it is the unique identifier.
    email = models.EmailField(_("email address"), unique=True)

    # Specifies the field to be used as the unique identifier for the user.
    USERNAME_FIELD = "email"

    # A list of fields that will be prompted for when creating a user
    # via the createsuperuser command. If empty, the USERNAME_FIELD is
    # the only required.
    REQUIRED_FIELDS = []

    # The CustomUserManager allows the creation of a user where email
    # is the unique identifier.
    objects = CustomUserManager()

    def __str__(self):
        return self.email
