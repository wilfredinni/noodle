from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
import logging
from apps.core.views import PingRateThrottle


class CoreViewsTests(APITestCase):
    """Test suite for core application views"""

    @classmethod
    def setUpTestData(cls):
        cls.ping_url = reverse("ping")

    def test_ping_view_success(self):
        """Test ping endpoint returns correct response"""
        with patch.object(logging.Logger, "info") as mock_logger:
            response = self.client.get(self.ping_url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.json(), {"ping": "pong"})
            mock_logger.assert_called_once()

    def test_ping_view_throttle_config(self):
        """Test ping endpoint throttle configuration"""
        throttle = PingRateThrottle()
        self.assertEqual(throttle.rate, "10/minute")

    def test_ping_view_invalid_methods(self):
        """Test ping endpoint rejects non-GET methods"""
        methods = ["post", "put", "patch", "delete"]
        for method in methods:
            with self.subTest(method=method):
                response = getattr(self.client, method)(self.ping_url)
                self.assertEqual(
                    response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED
                )
