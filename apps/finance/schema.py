from drf_spectacular.utils import OpenApiExample


class AccountExamples:
    CREATE_REQUEST = OpenApiExample(
        "Create Account",
        value={
            "name": "Main Bank Account",
            "type": "BANK",
            "currency": "USD",
            "closing_day": 25,
            "due_day_offset": 10,
        },
        request_only=True,
    )

    RESPONSE = OpenApiExample(
        "Account Details",
        value={
            "id": 1,
            "name": "Main Bank Account",
            "type": "BANK",
            "currency": "USD",
            "closing_day": 25,
            "due_day_offset": 10,
            "current_balance": 1500.50,
        },
        response_only=True,
    )


class CategoryExamples:
    CREATE_REQUEST = OpenApiExample(
        "Create Category",
        value={
            "name": "Groceries",
        },
        request_only=True,
    )

    RESPONSE = OpenApiExample(
        "Category Details",
        value={
            "id": 1,
            "name": "Groceries",
        },
        response_only=True,
    )


class TagExamples:
    CREATE_REQUEST = OpenApiExample(
        "Create Tag",
        value={
            "name": "Vacation",
            "color": "#FF5733",
        },
        request_only=True,
    )

    RESPONSE = OpenApiExample(
        "Tag Details",
        value={
            "id": 1,
            "name": "Vacation",
            "color": "#FF5733",
        },
        response_only=True,
    )


class TransactionExamples:
    STANDARD_REQUEST = OpenApiExample(
        "Standard Transaction",
        description="A simple income or expense transaction.",
        value={
            "type": "EXPENSE",
            "description": "Weekly Groceries",
            "amount": "150.00",
            "amount_currency": "USD",
            "transaction_date": "2023-10-27",
            "account": 1,
            "category": 1,
            "tags": [1, 2],
        },
        request_only=True,
    )

    TRANSFER_REQUEST = OpenApiExample(
        "Transfer Transaction",
        description="Transfer money between accounts.",
        value={
            "type": "EXPENSE",  # Transfers start as expense from source
            "description": "Transfer to Savings",
            "amount": "500.00",
            "amount_currency": "USD",
            "transaction_date": "2023-10-27",
            "account": 1,  # Source Account
            "is_transfer": True,
            "target_account_id": 2,  # Destination Account
        },
        request_only=True,
    )

    INSTALLMENT_REQUEST = OpenApiExample(
        "Installment Transaction",
        description="A purchase paid in installments.",
        value={
            "type": "EXPENSE",
            "description": "New Laptop",
            "amount": "1200.00",
            "amount_currency": "USD",
            "transaction_date": "2023-10-27",
            "account": 1,
            "category": 3,
            "is_installment": True,
            "total_installments": 12,
        },
        request_only=True,
    )

    RESPONSE = OpenApiExample(
        "Transaction Details",
        value={
            "id": 1,
            "type": "EXPENSE",
            "description": "Weekly Groceries",
            "amount": "150.00",
            "amount_currency": "USD",
            "transaction_date": "2023-10-27",
            "payment_date": "2023-11-05",
            "account": 1,
            "category": 1,
            "tags": [1, 2],
            "installment_number": None,
            "transfer_partner": None,
            "installment_plan": None,
        },
        response_only=True,
    )
