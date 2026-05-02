from django.urls import path
from .views import (
    AssignVolunteerView,
    DashboardSummaryView,
    GeocodeView,
    ItemDetailView,
    ItemListCreateView,
    MeView,
    UserRegistrationView,
    UserListView,
    ObtainAuthToken,
    RequestDetailView,
    RequestListCreateView,
    UpdateDeliveryStatusView,
    VolunteerLocationView,
)

urlpatterns = [
    # Items
    path('items/', ItemListCreateView.as_view(), name='item-list-create'),
    path('add_food/', ItemListCreateView.as_view(), name='add-food'),
    path('get_food/', ItemListCreateView.as_view(), name='get-food'),
    path('items/<int:pk>/', ItemDetailView.as_view(), name='item-detail'),

    # Users
    path('users/register/', UserRegistrationView.as_view(), name='user-register'),
    path('users/', UserListView.as_view(), name='user-list'),
    path('users/me/', MeView.as_view(), name='user-me'),

    # Login
    path('api-token-auth/', ObtainAuthToken.as_view(), name='api-token-auth'),
    path('geocode/', GeocodeView.as_view(), name='geocode'),

    # Requests
    path('requests/', RequestListCreateView.as_view(), name='request-list-create'),
    path('request_food/', RequestListCreateView.as_view(), name='request-food'),
    path('requests/<int:pk>/', RequestDetailView.as_view(), name='request-detail'),
    path('assign_volunteer/', AssignVolunteerView.as_view(), name='assign-volunteer'),
    path('update_delivery_status/', UpdateDeliveryStatusView.as_view(), name='update-delivery-status'),
    path('volunteer/location/', VolunteerLocationView.as_view(), name='volunteer-location'),
    path('dashboard/summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
]
