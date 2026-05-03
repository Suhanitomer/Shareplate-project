from rest_framework import serializers
from django.utils import timezone

from .models import Delivery, Item, Request, UserProfile


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = (
            'id',
            'email',
            'first_name',
            'last_name',
            'role',
            'phone_number',
            'password',
            'email_notifications_enabled',
            'is_verified',
        )
        extra_kwargs = {
            'password': {'write_only': True},
            'is_verified': {'read_only': True}
        }

    def create(self, validated_data):
        return UserProfile.objects.create_user(**validated_data)


class CompactUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ('id', 'email', 'first_name', 'last_name', 'full_name', 'role', 'is_verified')
        read_only_fields = ('is_verified',)

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.email


class ItemSerializer(serializers.ModelSerializer):
    donor = CompactUserSerializer(read_only=True)
    donor_name = serializers.SerializerMethodField()
    expiry_status = serializers.SerializerMethodField()
    food_type = serializers.CharField(source='name', required=False)
    location = serializers.CharField(source='address', required=False)
    timestamp = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Item
        fields = (
            'id',
            'name',
            'food_type',
            'description',
            'address',
            'location',
            'quantity',
            'expiry_date',
            'expiry_status',
            'is_available',
            'created_at',
            'timestamp',
            'donor',
            'donor_name',
            'latitude',
            'longitude',
        )
        read_only_fields = ('donor', 'created_at', 'is_available', 'expiry_status', 'donor_name', 'timestamp')

    def get_donor_name(self, obj):
        return obj.donor.get_full_name() or obj.donor.email if obj.donor else "Unknown"

    def get_expiry_status(self, obj):
        days_left = (obj.expiry_date - timezone.localdate()).days
        if days_left < 0:
            return 'expired'
        if days_left == 0:
            return 'today'
        if days_left <= 2:
            return 'urgent'
        return 'fresh'


class RequestSerializer(serializers.ModelSerializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(is_available=True),
        write_only=True
    )
    item_details = ItemSerializer(source='item', read_only=True)
    requester = CompactUserSerializer(read_only=True)
    recipient_location = serializers.SerializerMethodField()
    tracking_message = serializers.SerializerMethodField()
    delivery = serializers.SerializerMethodField()

    class Meta:
        model = Request
        fields = [
            'id',
            'item',
            'item_details',
            'requester',
            'status',
            'delivery_status',
            'recipient_location',
            'tracking_message',
            'delivery',
            'recipient_latitude',
            'recipient_longitude',
            'created_at',
            'updated_at',
            'assigned_at',
            'completed_at',
        ]
        read_only_fields = [
            'status',
            'delivery_status',
            'requester',
            'recipient_location',
            'tracking_message',
            'delivery',
            'created_at',
            'updated_at',
            'assigned_at',
            'completed_at',
        ]



    def get_recipient_location(self, obj):
        if obj.recipient_latitude is None or obj.recipient_longitude is None:
            return None

        return {
            'latitude': obj.recipient_latitude,
            'longitude': obj.recipient_longitude,
        }

    def get_tracking_message(self, obj):
        status_messages = {
            'pending': "Recipient requested food. Waiting for a volunteer assignment.",
            'assigned': "Volunteer assigned and heading to pickup location.",
            'picked': "Volunteer picked up the food and preparing delivery route.",
            'delivering': "Volunteer is on the way to the recipient.",
            'delivered': "Food delivered successfully.",
        }
        return status_messages.get(obj.delivery_status, "Live update in progress.")

    def get_delivery(self, obj):
        delivery = getattr(obj, 'delivery_record', None)
        if not delivery:
            return None
        return {
            'id': delivery.id,
            'status': delivery.status,
            'tracking_note': delivery.tracking_note,
            'assigned_to': delivery.assigned_to,
            'request_id': delivery.request_id,
            'current_latitude': delivery.current_latitude,
            'current_longitude': delivery.current_longitude,
            'updated_at': delivery.updated_at,
        }

    def validate_item(self, value):
        if not value.is_available or value.expiry_date < timezone.localdate():
            raise serializers.ValidationError("This item is no longer available.")
        request = self.context.get('request')
        if request and request.user.is_authenticated and value.donor_id == request.user.id:
            raise serializers.ValidationError("You cannot claim your own donation.")
        return value


class RequestStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Request
        fields = ('delivery_status',)

    def validate_delivery_status(self, value):
        valid_statuses = {choice[0] for choice in Request.DELIVERY_STATUS}
        if value not in valid_statuses:
            raise serializers.ValidationError("Invalid delivery status.")
        return value





class DeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = Delivery
        fields = (
            'id',
            'request',
            'assigned_to',
            'status',
            'tracking_note',
            'current_latitude',
            'current_longitude',
            'assigned_at',
            'picked_at',
            'on_the_way_at',
            'delivered_at',
            'updated_at',
        )
        read_only_fields = (
            'id',
            'assigned_at',
            'picked_at',
            'on_the_way_at',
            'delivered_at',
            'updated_at',
        )
