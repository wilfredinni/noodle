from django.urls import path

from . import views

appname = "core"

urlpatterns = [
    path("ping/", views.ping, name="ping"),
]
