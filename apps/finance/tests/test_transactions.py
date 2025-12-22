import datetime
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.finance.models import Account, InstallmentPlan, Transaction
from apps.users.models import CustomUser


@pytest.mark.django_db
class TestTransactionViewSet:
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

    @pytest.fixture
    def target_account(self, user):
        return Account.objects.create(
            user=user,
            name="Target Account",
            type=Account.AccountType.SAVINGS,
            currency="USD",
        )

    def test_create_standard_transaction(self, api_client, user, account):
        api_client.force_authenticate(user=user)
        url = reverse("transaction-list")

        data = {
            "account": account.id,
            "description": "Test Txn",
            "amount": "100.00",
            "amount_currency": "USD",
            "transaction_date": "2023-01-01",
            "type": "expense",
        }
        response = api_client.post(url, data)
        assert response.status_code == 201
        assert Transaction.objects.count() == 1
        txn = Transaction.objects.first()
        assert txn.payment_date == datetime.date(2023, 1, 1)

    def test_create_transfer(self, api_client, user, account, target_account):
        api_client.force_authenticate(user=user)
        url = reverse("transaction-list")

        data = {
            "account": account.id,
            "description": "Transfer",
            "amount": "50.00",
            "amount_currency": "USD",
            "transaction_date": "2023-01-01",
            "type": "expense",  # Source is expense
            "is_transfer": True,
            "target_account_id": target_account.id,
        }
        response = api_client.post(url, data)
        assert response.status_code == 201

        assert Transaction.objects.count() == 2
        source = Transaction.objects.get(account=account)
        dest = Transaction.objects.get(account=target_account)

        assert source.type == "expense"
        assert dest.type == "income"
        assert source.transfer_partner == dest
        assert dest.transfer_partner == source
        assert source.amount.amount == Decimal("50.00")
        assert dest.amount.amount == Decimal("50.00")

    def test_create_installment(self, api_client, user, account):
        api_client.force_authenticate(user=user)
        url = reverse("transaction-list")

        data = {
            "account": account.id,
            "description": "iPhone",
            "amount": "1000.00",
            "amount_currency": "USD",
            "transaction_date": "2023-01-01",
            "type": "expense",
            "is_installment": True,
            "total_installments": 10,
        }
        response = api_client.post(url, data)
        assert response.status_code == 201

        assert InstallmentPlan.objects.count() == 1
        assert Transaction.objects.count() == 10

        plan = InstallmentPlan.objects.first()
        assert plan.total_amount == Decimal("1000.00")
        assert plan.total_installments == 10

        txns = Transaction.objects.filter(installment_plan=plan).order_by(
            "installment_number"
        )
        assert txns.count() == 10
        assert txns[0].amount.amount == Decimal("100.00")  # 1000 / 10
        assert txns[0].transaction_date == datetime.date(2023, 1, 1)
        assert txns[1].transaction_date == datetime.date(2023, 2, 1)

    def test_delete_transfer(self, api_client, user, account, target_account):
        api_client.force_authenticate(user=user)
        # Create transfer first
        t1 = Transaction.objects.create(
            account=account,
            description="T1",
            amount=10,
            type="expense",
            transaction_date="2023-01-01",
        )
        t2 = Transaction.objects.create(
            account=target_account,
            description="T2",
            amount=10,
            type="income",
            transaction_date="2023-01-01",
        )
        t1.transfer_partner = t2
        t1.save()
        t2.transfer_partner = t1
        t2.save()

        url = reverse("transaction-detail", args=[t1.id])
        response = api_client.delete(url)
        assert response.status_code == 204

        assert Transaction.objects.count() == 0
