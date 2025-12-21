from django.contrib import admin

from apps.finance.models import Account, Category, InstallmentPlan, Tag, Transaction


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "type", "currency", "closing_day")
    list_filter = ("type", "currency", "user")
    search_fields = ("name", "user__email")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "user")
    list_filter = ("user",)
    search_fields = ("name", "user__email")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "color")
    list_filter = ("color", "user")
    search_fields = ("name", "user__email")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = (
        "description",
        "amount",
        "transaction_date",
        "payment_date",
        "account",
        "category",
        "type",
    )
    list_filter = ("type", "account", "category", "transaction_date", "payment_date")
    search_fields = ("description", "account__name", "category__name")
    date_hierarchy = "transaction_date"


@admin.register(InstallmentPlan)
class InstallmentPlanAdmin(admin.ModelAdmin):
    list_display = (
        "description",
        "total_amount",
        "total_installments",
        "interest_rate",
    )
    search_fields = ("description",)
