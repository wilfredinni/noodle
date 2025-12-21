from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.db.models import Case, DecimalField, F, Sum, Value, When
from djmoney.money import Money
from rest_framework import serializers

from apps.finance.models import Account, Category, InstallmentPlan, Tag, Transaction
from apps.finance.services import calculate_payment_date


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "user"]
        read_only_fields = ["user"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name", "color", "user"]
        read_only_fields = ["user"]


class AccountSerializer(serializers.ModelSerializer):
    current_balance = serializers.SerializerMethodField()
    currency = serializers.CharField()

    class Meta:
        model = Account
        fields = [
            "id",
            "name",
            "type",
            "currency",
            "closing_day",
            "due_day_offset",
            "current_balance",
            "user",
        ]
        read_only_fields = ["user", "current_balance"]

    def get_current_balance(self, obj):
        qs = obj.transactions.all()
        balance = qs.aggregate(
            balance=Sum(
                Case(
                    When(type=Transaction.TransactionType.INCOME, then=F("amount")),
                    When(type=Transaction.TransactionType.EXPENSE, then=-F("amount")),
                    default=Value(0),
                    output_field=DecimalField(),
                )
            )
        )["balance"]

        return balance or 0


class InstallmentPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPlan
        fields = [
            "id",
            "description",
            "total_amount",
            "total_installments",
            "interest_rate",
        ]


class TransactionSerializer(serializers.ModelSerializer):
    is_transfer = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    target_account_id = serializers.IntegerField(write_only=True, required=False)
    exchange_rate = serializers.DecimalField(
        write_only=True,
        required=False,
        max_digits=10,
        decimal_places=6,
    )
    is_installment = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    total_installments = serializers.IntegerField(write_only=True, required=False)
    installment_plan = InstallmentPlanSerializer(read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "type",
            "description",
            "amount",
            "amount_currency",
            "transaction_date",
            "payment_date",
            "account",
            "category",
            "tags",
            "installment_number",
            "transfer_partner",
            "installment_plan",
            "is_transfer",
            "target_account_id",
            "exchange_rate",
            "is_installment",
            "total_installments",
        ]
        read_only_fields = [
            "payment_date",
            "transfer_partner",
            "installment_number",
            "installment_plan",
        ]

    def validate(self, data):
        is_transfer = data.get("is_transfer", False)
        is_installment = data.get("is_installment", False)

        if is_transfer and is_installment:
            raise serializers.ValidationError(
                "Transaction cannot be both a transfer and an installment plan."
            )

        if is_transfer:
            if not data.get("target_account_id"):
                raise serializers.ValidationError(
                    {"target_account_id": "Required for transfers."}
                )
            if data.get("type") != Transaction.TransactionType.EXPENSE:
                pass

        if is_installment:
            if not data.get("total_installments"):
                raise serializers.ValidationError(
                    {"total_installments": "Required for installments."}
                )
            if data.get("total_installments") < 2:
                raise serializers.ValidationError(
                    {"total_installments": "Must be at least 2."}
                )

        return data

    @transaction.atomic
    def create(self, validated_data):
        is_transfer = validated_data.pop("is_transfer", False)
        is_installment = validated_data.pop("is_installment", False)

        target_account_id = validated_data.pop("target_account_id", None)
        exchange_rate = validated_data.pop("exchange_rate", None)
        total_installments = validated_data.pop("total_installments", None)
        tags = validated_data.pop("tags", [])

        if is_transfer:
            return self._create_transfer(
                validated_data,
                target_account_id,
                exchange_rate,
                tags,
            )
        elif is_installment:
            return self._create_installment(validated_data, total_installments, tags)
        else:
            return self._create_standard(validated_data, tags)

    def _create_standard(self, validated_data, tags):
        account = validated_data["account"]
        transaction_date = validated_data["transaction_date"]
        validated_data["payment_date"] = calculate_payment_date(
            transaction_date, account
        )

        txn = Transaction.objects.create(**validated_data)
        txn.tags.set(tags)
        return txn

    def _create_transfer(self, validated_data, target_account_id, exchange_rate, tags):
        source_account = validated_data["account"]
        try:
            target_account = Account.objects.get(id=target_account_id)
        except Account.DoesNotExist:
            raise serializers.ValidationError({"target_account_id": "Invalid account."})

        if source_account.currency != target_account.currency:
            raise serializers.ValidationError(
                "Transfers between different currencies are not supported yet."
            )

        amount = validated_data["amount"]

        # 1. Create Source Transaction (Expense)
        source_data = validated_data.copy()
        source_data["type"] = Transaction.TransactionType.EXPENSE
        source_data["payment_date"] = calculate_payment_date(
            source_data["transaction_date"], source_account
        )

        source_txn = Transaction.objects.create(**source_data)
        source_txn.tags.set(tags)

        # 2. Create Destination Transaction (Income)
        dest_data = validated_data.copy()
        dest_data["account"] = target_account
        dest_data["type"] = Transaction.TransactionType.INCOME
        dest_data["amount"] = amount  # Assuming same currency/amount for now
        dest_data["payment_date"] = calculate_payment_date(
            dest_data["transaction_date"], target_account
        )
        # Description might need adjustment? "Transfer from X"

        dest_txn = Transaction.objects.create(**dest_data)
        dest_txn.tags.set(tags)

        # 3. Link them
        source_txn.transfer_partner = dest_txn
        source_txn.save()

        dest_txn.transfer_partner = source_txn
        dest_txn.save()

        return source_txn

    def _create_installment(self, validated_data, total_installments, tags):
        account = validated_data["account"]
        base_date = validated_data["transaction_date"]
        amount = validated_data["amount"]
        description = validated_data["description"]

        plan = InstallmentPlan.objects.create(
            description=description,
            total_amount=amount.amount,
            total_installments=total_installments,
        )

        total_val = amount.amount
        share = round(total_val / total_installments, 2)
        remainder = total_val - (share * total_installments)

        transactions = []
        for i in range(total_installments):
            current_amount = share
            if i == total_installments - 1:
                current_amount += remainder

            quota_date = base_date + relativedelta(months=i)
            payment_date = calculate_payment_date(quota_date, account)

            txn_data = validated_data.copy()
            txn_data["amount"] = Money(current_amount, amount.currency)
            txn_data["transaction_date"] = quota_date
            txn_data["payment_date"] = payment_date
            txn_data["installment_number"] = i + 1
            txn_data["installment_plan"] = plan

            txn = Transaction.objects.create(**txn_data)
            txn.tags.set(tags)
            transactions.append(txn)

        return transactions[0]
