import datetime

import pytest

from apps.finance.models import Account
from apps.finance.services import calculate_payment_date


@pytest.mark.django_db
class TestPaymentDateService:
    def test_non_credit_card(self):
        account = Account(type=Account.AccountType.CHECKING)
        txn_date = datetime.date(2023, 1, 15)
        assert calculate_payment_date(txn_date, account) == txn_date

    def test_credit_card_before_closing(self):
        # Closing day 5, Offset 5.
        # Trans Jan 1.
        # Logic: Month + 1 (Feb).
        # Day = 5 + 5 = 10.
        # Code: Feb 1 + (5+5-1) days = Feb 1 + 9 days = Feb 10.

        account = Account(
            type=Account.AccountType.CREDIT_CARD, closing_day=5, due_day_offset=5
        )
        txn_date = datetime.date(2023, 1, 1)
        expected = datetime.date(2023, 2, 10)
        assert calculate_payment_date(txn_date, account) == expected

    def test_credit_card_after_closing(self):
        # Closing 5, Offset 5.
        # Trans Jan 6.
        # Logic: Month + 2 (March).
        # Day = 10.

        account = Account(
            type=Account.AccountType.CREDIT_CARD, closing_day=5, due_day_offset=5
        )
        txn_date = datetime.date(2023, 1, 6)
        expected = datetime.date(2023, 3, 10)
        assert calculate_payment_date(txn_date, account) == expected

    def test_year_rollover(self):
        # Closing 20, Offset 10.
        # Trans Dec 25.
        # > Closing. Month + 2.
        # Dec -> Jan -> Feb.

        account = Account(
            type=Account.AccountType.CREDIT_CARD, closing_day=20, due_day_offset=10
        )
        txn_date = datetime.date(2023, 12, 25)
        # Target Month: Feb 2024.
        # Target Day: 30.
        # Feb 2024 has 29 days (Leap Year).
        # Feb 1 + (20+10-1) = Feb 1 + 29 days.
        # Feb 1 + 28 days = Feb 29.
        # Feb 1 + 29 days = March 1.

        expected = datetime.date(2024, 3, 1)
        assert calculate_payment_date(txn_date, account) == expected
