import django_filters

from apps.finance.models import Transaction


class TransactionFilter(django_filters.FilterSet):
    start_date = django_filters.DateFilter(field_name="payment_date", lookup_expr="gte")
    end_date = django_filters.DateFilter(field_name="payment_date", lookup_expr="lte")
    account = django_filters.NumberFilter(field_name="account__id")
    category = django_filters.NumberFilter(field_name="category__id")
    tags = django_filters.NumberFilter(field_name="tags__id")

    class Meta:
        model = Transaction
        fields = ["account", "category", "tags", "type", "start_date", "end_date"]
