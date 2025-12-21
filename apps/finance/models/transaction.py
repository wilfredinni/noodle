from django.db import models

from djmoney.models.fields import MoneyField

from apps.core.models import BaseModel
from apps.finance.models.account import Account
from apps.finance.models.category import Category, Tag


class Transaction(BaseModel):
    class TransactionType(models.TextChoices):
        INCOME = "income", "Income"
        EXPENSE = "expense", "Expense"

    type = models.CharField(max_length=20, choices=TransactionType.choices)
    description = models.CharField(max_length=255)
    amount = MoneyField(max_digits=14, decimal_places=2, default_currency="USD")
    transaction_date = models.DateField()
    payment_date = models.DateField(null=True, blank=True)
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="transactions")
    installment_number = models.PositiveIntegerField(null=True, blank=True)
    transfer_partner = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transfer_original",
    )
    installment_plan = models.ForeignKey(
        "InstallmentPlan",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="transactions",
    )

    class Meta:
        ordering = ["-payment_date", "-transaction_date"]
        indexes = [
            models.Index(fields=["account", "payment_date"]),
            models.Index(fields=["payment_date"]),
            models.Index(fields=["category"]),
            models.Index(fields=["installment_plan"]),
        ]

    def __str__(self):
        return f"{self.description} - {self.amount} on {self.transaction_date}"

    def delete(self, *args, **kwargs):
        if self.transfer_partner:
            partner = self.transfer_partner
            self.transfer_partner = None
            self.save()

            partner.transfer_partner = None
            partner.save()
            partner.delete()

        super().delete(*args, **kwargs)


class InstallmentPlan(BaseModel):
    description = models.CharField(max_length=255)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    total_installments = models.PositiveIntegerField()
    interest_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)

    def __str__(self):
        return f"{self.description} - {self.total_installments} installments"
