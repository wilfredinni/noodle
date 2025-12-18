from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
import logging

from .models import CustomUser
from .utils import get_errors

security_logger = logging.getLogger("django.security")
MIN_PASSWORD_LENGTH = getattr(settings, "MIN_PASSWORD_LENGTH", 8)


class AuthTokenSerializer(serializers.Serializer):
    email = serializers.EmailField(label=_("Email"), write_only=True)
    password = serializers.CharField(
        label=_("Password"),
        style={"input_type": "password"},
        trim_whitespace=False,
        write_only=True,
    )
    token = serializers.CharField(label=_("Token"), read_only=True)

    def validate(self, attrs: dict) -> dict:
        email = attrs.get("email")
        password = attrs.get("password")

        # The authenticate call simply returns None for is_active=False users
        if email and password:
            user: CustomUser = authenticate(
                request=self.context.get("request"), email=email, password=password
            )

            if not user:
                msg = _("Unable to log in with provided credentials.")
                security_logger.warning(f"Failed login attempt for email: {email}")
                raise serializers.ValidationError(msg, code="authorization")
        else:
            msg = _('Must include "email" and "password".')
            raise serializers.ValidationError(msg, code="authorization")

        attrs["user"] = user
        return attrs


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=MIN_PASSWORD_LENGTH)
    password2 = serializers.CharField(write_only=True, min_length=MIN_PASSWORD_LENGTH)

    class Meta:
        model = CustomUser
        fields = ("email", "password", "password2")

    def validate(self, data: dict) -> dict:
        password = data["password"]

        # Check password match
        if password != data["password2"]:
            raise serializers.ValidationError("Passwords do not match.")

        user_data = {k: v for k, v in data.items() if k != "password2"}
        try:
            validate_password(password, self.Meta.model(**user_data))
        except Exception as e:
            security_logger.error(f"Password validation error: {type(e)} - {str(e)}")
            security_logger.error(f"Error details: {e.__dict__}")
            if hasattr(e, "error_list"):
                errors = get_errors(e)
            else:
                errors = [
                    _("An error occurred during password validation. Please try again.")
                ]
            raise serializers.ValidationError({"password": errors})

        return data

    def create(self, validated_data: dict) -> CustomUser:
        validated_data.pop("password2")
        return CustomUser.objects.create_user(**validated_data)


class UserProfileSerializer(serializers.ModelSerializer):

    class Meta:
        model = CustomUser
        fields = ("email", "password", "first_name", "last_name")
        extra_kwargs = {"password": {"write_only": True, "min_length": 8}}

    def validate(self, data: dict) -> dict:
        if "password" in data:
            try:
                validate_password(data["password"], self.Meta.model(**data))
            except Exception as e:
                security_logger.error(
                    f"Password validation error: {type(e)} - {str(e)}"
                )
                security_logger.error(f"Error details: {e.__dict__}")
                if hasattr(e, "error_list"):
                    errors = get_errors(e)
                else:
                    errors = ["Password validation error. Please try again."]

                raise serializers.ValidationError({"password": errors})

        return data

    def update(self, instance: CustomUser, validated_data: dict) -> CustomUser:
        password = validated_data.pop("password", None)
        user: CustomUser = super().update(instance, validated_data)

        if password:
            user.set_password(password)
            user.save()

        return user


class LoginResponseSerializer(serializers.Serializer):
    expiry = serializers.DateTimeField()
    token = serializers.CharField()
    user = UserProfileSerializer()

    def get_user(self, obj):
        user = obj.get("user")
        return {
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        }
