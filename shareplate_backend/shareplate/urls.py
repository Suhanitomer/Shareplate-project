from django.contrib import admin
from django.urls import path
from .views import (
    ItemListCreateView,
    UserRegistrationView,
    UserListView,
    ObtainAuthToken,
    RequestListCreateView
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # Items
    path('items/', ItemListCreateView.as_view(), name='item-list-create'),

    # Users
    path('users/register/', UserRegistrationView.as_view(), name='user-register'),
    path('users/', UserListView.as_view(), name='user-list'),

    # Login
    path('api-token-auth/', ObtainAuthToken.as_view(), name='api-token-auth'),

    # Requests
    path('requests/', RequestListCreateView.as_view(), name='request-list-create'),
]