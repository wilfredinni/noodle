from drf_spectacular.utils import extend_schema
from rest_framework import viewsets

from apps.finance.filters import TransactionFilter
from apps.finance.models import Account, Category, Tag, Transaction
from apps.finance.serializers import (
    AccountSerializer,
    CategorySerializer,
    TagSerializer,
    TransactionSerializer,
)
from apps.finance.schema import (
    AccountExamples,
    CategoryExamples,
    TagExamples,
    TransactionExamples,
)


@extend_schema(
    tags=["Finance"],
    examples=[AccountExamples.CREATE_REQUEST, AccountExamples.RESPONSE],
)
class AccountViewSet(viewsets.ModelViewSet):
    serializer_class = AccountSerializer

    def get_queryset(self):
        return Account.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(
    tags=["Finance"],
    examples=[CategoryExamples.CREATE_REQUEST, CategoryExamples.RESPONSE],
)
class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(
    tags=["Finance"],
    examples=[TagExamples.CREATE_REQUEST, TagExamples.RESPONSE],
)
class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer

    def get_queryset(self):
        return Tag.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


@extend_schema(
    tags=["Finance"],
    examples=[
        TransactionExamples.STANDARD_REQUEST,
        TransactionExamples.TRANSFER_REQUEST,
        TransactionExamples.INSTALLMENT_REQUEST,
        TransactionExamples.RESPONSE,
    ],
)
class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer
    filterset_class = TransactionFilter

    def get_queryset(self):
        return Transaction.objects.filter(account__user=self.request.user)

    def perform_create(self, serializer):
        serializer.save()
