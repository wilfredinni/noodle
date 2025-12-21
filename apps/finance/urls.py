from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.finance.views import (
    TransactionViewSet,
    AccountViewSet,
    CategoryViewSet,
    TagViewSet,
)

router = DefaultRouter()
router.register(r"transactions", TransactionViewSet, basename="transaction")
router.register(r"accounts", AccountViewSet, basename="account")
router.register(r"categories", CategoryViewSet, basename="category")
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = [
    path("", include(router.urls)),
]
