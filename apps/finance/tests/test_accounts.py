from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.finance.models import Account, Transaction
from apps.users.models import CustomUser


@pytest.mark.django_db
class TestAccountViewSet:
    @pytest.fixture
    def api_client(self):
        return APIClient()

    @pytest.fixture
    def user(self):
        return CustomUser.objects.create_user(
            email="test@example.com", password="password"
        )

    @pytest.fixture
    def account(self, user):
        return Account.objects.create(
            user=user,
            name="Test Account",
            type=Account.AccountType.CHECKING,
            currency="USD",
        )

    def test_current_balance(self, api_client, user, account):
        api_client.force_authenticate(user=user)

        # Create transactions
        Transaction.objects.create(
            account=account,
            description="Income",
            amount=100,
            type="income",
            transaction_date="2023-01-01",
        )
        Transaction.objects.create(
            account=account,
            description="Expense",
            amount=30,
            type="expense",
            transaction_date="2023-01-02",
        )

        url = reverse("account-detail", args=[account.id])
        response = api_client.get(url)
        assert response.status_code == 200

        # Balance should be 100 - 30 = 70
        assert response.data["current_balance"] == Decimal("70.00")
