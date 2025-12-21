import datetime
from dateutil.relativedelta import relativedelta
from apps.finance.models import Account


def calculate_payment_date(
    transaction_date: datetime.date, account: Account
) -> datetime.date:
    """
    Calculates the payment date based on the account type and settings.

    If account is NOT a Credit Card: payment_date = transaction_date.
    If account IS a Credit Card:
        - If transaction_date.day <= closing_day:
            payment_date = (transaction_date + 1 month)
                .replace(day=closing_day + due_day_offset)
        - If transaction_date.day > closing_day:
            payment_date = (transaction_date + 2 months)
                .replace(day=closing_day + due_day_offset)

    Note: The logic for "day = closing_day + due_day_offset" might overflow the month
    (e.g. day 35). We should handle this by adding the offset as a timedelta.
    """

    if account.type != Account.AccountType.CREDIT_CARD:
        return transaction_date

    if not account.closing_day:
        # Fallback if closing_day is not set for a credit card
        return transaction_date

    closing_day = account.closing_day
    due_day_offset = account.due_day_offset

    # Determine the base month for the closing date
    if transaction_date.day <= closing_day:
        # Current month's statement, due next month
        months_to_add = 1
    else:
        # Next month's statement, due in two months
        months_to_add = 2

    # Let's go to the first day of the calculated target month (Month+1 or Month+2)
    # Note: relativedelta(months=1) on Jan 31 gives Feb 28.
    # We want "Feb".
    target_month_first = transaction_date.replace(day=1) + relativedelta(
        months=months_to_add
    )

    # Now add the days.
    # Day = closing_day + due_day_offset
    # So we want the (closing_day + due_day_offset)-th day of that month.
    # Which is: first_day + (closing_day + due_day_offset - 1) days.

    days_to_add = closing_day + due_day_offset - 1
    payment_date = target_month_first + datetime.timedelta(days=days_to_add)

    return payment_date
