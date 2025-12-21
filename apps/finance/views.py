from django.db import transaction
from rest_framework import viewsets
from drf_spectacular.utils import extend_schema

from apps.finance.models import Account, Transaction, Category, Tag
from apps.finance.serializers import (
    AccountSerializer,
    TransactionSerializer,
    CategorySerializer,
    TagSerializer,
)
from apps.finance.filters import TransactionFilter


@extend_schema(tags=["Finance"])
class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(tags=["Finance"])
class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(tags=["Finance"])
class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(tags=["Finance"])
class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter

    def get_queryset(self):
        return Transaction.objects.filter(account__user=self.request.user)

    def perform_create(self, serializer):
        # The serializer handles the complex creation logic including atomic blocks
        serializer.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            # If the transaction has a transfer_partner, delete the partner first
            # (to prevent orphans).
            if instance.transfer_partner:
                instance.transfer_partner.delete()

            # If the transaction is part of an InstallmentPlan, allow deleting the
            # specific installment.
            # Default delete behavior works here.

            instance.delete()
