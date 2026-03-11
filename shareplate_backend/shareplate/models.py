import logging
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils.translation import gettext_lazy as _
from django.contrib.auth.base_user import BaseUserManager
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

logger = logging.getLogger(__name__)


# ==============================
# CUSTOM USER MANAGER
# ==============================
class CustomUserManager(BaseUserManager):

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError(_('The Email must be set'))

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save()
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        return self.create_user(email, password, **extra_fields)


# ==============================
# USER PROFILE
# ==============================
class UserProfile(AbstractUser):

    username = None
    email = models.EmailField(_('email address'), unique=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    ROLE_CHOICES = [
        ('donor', 'Donor'),
        ('recipient', 'Recipient'),
        ('volunteer', 'Volunteer'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True, null=True)
    phone_number = models.CharField(max_length=15, blank=True, null=True)
    email_notifications_enabled = models.BooleanField(default=True)

    objects = CustomUserManager()

    def __str__(self):
        return self.email


# ==============================
# ITEM MODEL
# ==============================
class Item(models.Model):

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    expiry_date = models.DateField()
    is_available = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    donor = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name='donated_items'
    )

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    def save(self, *args, **kwargs):

        old_instance = None
        if self.pk:
            try:
                old_instance = Item.objects.get(pk=self.pk)
            except Item.DoesNotExist:
                pass

        if self.address and (not old_instance or old_instance.address != self.address):
            geolocator = Nominatim(user_agent="shareplate_backend")
            try:
                location_data = geolocator.geocode(self.address, timeout=10)
                if location_data:
                    self.latitude = location_data.latitude
                    self.longitude = location_data.longitude
            except GeocoderTimedOut:
                logger.warning("Geocoding timed out for %s", self.address)
            except Exception as e:
                logger.error("Geocoding error: %s", e)

        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


# ==============================
# REQUEST MODEL
# ==============================
class Request(models.Model):

    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Accepted', 'Accepted'),
        ('Rejected', 'Rejected'),
    ]

    DELIVERY_STATUS = [
        ('pending', 'Pending'),
        ('assigned', 'Assigned'),
        ('picked', 'Picked Up'),
        ('delivering', 'Delivering'),
        ('delivered', 'Delivered'),
    ]

    item = models.ForeignKey(
        Item,
        on_delete=models.CASCADE,
        related_name='requests'
    )

    requester = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name='requests_made'
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='Pending'
    )

    delivery_status = models.CharField(
        max_length=20,
        choices=DELIVERY_STATUS,
        default='pending'
    )

    volunteer = models.ForeignKey(
        UserProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries'
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Request for {self.item.name} by {self.requester.email}"


# ==============================
# VOLUNTEER LIVE LOCATION
# ==============================
class VolunteerLocation(models.Model):

    volunteer = models.OneToOneField(
        UserProfile,
        on_delete=models.CASCADE
    )

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Location of {self.volunteer.email}"