from django.contrib import admin
# from django.contrib.gis import admin
# from leaflet.admin import LeafletGeoAdmin
from .models import Delivery, Item, Request, UserProfile

@admin.register(Item)
class ItemAdmin(admin.ModelAdmin): # Changed from LeafletGeoAdmin
    """
    Admin interface for the Item model, using Leaflet for map widgets.
    """
    # Customize the admin list display, search fields, etc. here
    list_display = ('name', 'donor', 'address', 'is_available', 'expiry_date')
    list_filter = ('is_available', 'expiry_date')
    search_fields = ('name', 'description', 'address', 'donor__email')

@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    """Admin interface for the Request model."""
    list_display = ('item', 'requester', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('item__name', 'requester__email')

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    """Admin interface for the UserProfile model."""
    list_display = ('email', 'first_name', 'last_name', 'role', 'phone_number', 'email_notifications_enabled', 'is_verified', 'is_staff', 'is_active')
    list_editable = ('is_verified',)
    list_filter = ('role', 'is_staff', 'is_active', 'is_verified', 'email_notifications_enabled')
    search_fields = ('email', 'first_name', 'last_name', 'phone_number')
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'phone_number', 'role')}),
        ('Permissions', {'fields': ('is_active', 'is_verified', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
        ('Notifications', {'fields': ('email_notifications_enabled',)}),
    )
@admin.register(Delivery)
class DeliveryAdmin(admin.ModelAdmin):
    """Admin interface for the Delivery model."""
    list_display = ('request', 'status', 'assigned_to', 'updated_at')
    list_filter = ('status',)
    search_fields = ('request__item__name', 'assigned_to')
