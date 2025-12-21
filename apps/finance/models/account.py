from django.db import models
from djmoney.models.fields import CurrencyField

from apps.core.models import BaseModel
from apps.users.models import CustomUser


class Account(BaseModel):
    class AccountType(models.TextChoices):
        # Assets
        CHECKING = "CHECKING", "Checking"
        SAVINGS = "SAVINGS", "Savings / Investment"
        CASH = "CASH", "Cash / Wallet"

        # Liabilities
        CREDIT_CARD = "CREDIT", "Credit Card"
        LOAN = "LOAN", "Loan / Line of Credit"

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="accounts",
    )
    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=AccountType.choices)
    currency = CurrencyField(default="USD")
    closing_day = models.PositiveIntegerField(null=True, blank=True)
    due_day_offset = models.PositiveIntegerField(default=10)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.currency})"
