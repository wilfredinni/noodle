from django.db import models


class BaseModel(models.Model):
    """
    An abstract base class that provides created_at and updated_at fields
    """

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
