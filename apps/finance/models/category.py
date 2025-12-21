from django.db import models

from apps.core.models import BaseModel
from apps.users.models import CustomUser


class Category(BaseModel):
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="categories",
    )
    name = models.CharField(max_length=255)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]
        indexes = [models.Index(fields=["user"])]

    def __str__(self):
        return self.name


class Tag(BaseModel):
    class Color(models.TextChoices):
        SLATE = "slate", "Slate"
        GRAY = "gray", "Gray"
        ZINC = "zinc", "Zinc"
        NEUTRAL = "neutral", "Neutral"
        STONE = "stone", "Stone"
        RED = "red", "Red"
        ORANGE = "orange", "Orange"
        AMBER = "amber", "Amber"
        YELLOW = "yellow", "Yellow"
        LIME = "lime", "Lime"
        GREEN = "green", "Green"
        EMERALD = "emerald", "Emerald"
        TEAL = "teal", "Teal"
        CYAN = "cyan", "Cyan"
        SKY = "sky", "Sky"
        BLUE = "blue", "Blue"
        INDIGO = "indigo", "Indigo"
        VIOLET = "violet", "Violet"
        PURPLE = "purple", "Purple"
        FUCHSIA = "fuchsia", "Fuchsia"
        PINK = "pink", "Pink"
        ROSE = "rose", "Rose"

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name="tags",
    )
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=20, choices=Color.choices, default=Color.SLATE)

    class Meta:
        unique_together = ("user", "name")
        ordering = ["name"]
        indexes = [models.Index(fields=["user"])]

    def __str__(self):
        return self.name
