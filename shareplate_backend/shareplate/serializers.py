from rest_framework import serializers
from .models import Item, UserProfile, Request

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('id', 'email', 'first_name', 'last_name', 'role', 'phone_number', 'password')
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = UserProfile.objects.create_user(**validated_data)
        return user

class ItemSerializer(serializers.ModelSerializer):
    donor_name = serializers.SerializerMethodField()

    def get_donor_name(self, obj):
        return obj.donor.email if obj.donor else "Unknown"
    
    class Meta:
        model = Item
        fields = ('id', 'name', 'description', 'address', 'quantity', 'expiry_date', 'is_available', 'created_at', 'donor', 'donor_name', 'latitude', 'longitude')
        read_only_fields = ('donor', 'created_at', 'latitude', 'longitude')

from rest_framework import serializers
from .models import Request, Item

class RequestSerializer(serializers.ModelSerializer):
    item = serializers.PrimaryKeyRelatedField(
        queryset=Item.objects.filter(is_available=True)
    )

    class Meta:
        model = Request
        fields = ['id', 'item', 'status', 'created_at']
        read_only_fields = ['status', 'created_at']
