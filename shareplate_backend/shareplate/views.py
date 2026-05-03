import logging
import random

from django.contrib.auth import authenticate
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from geopy.geocoders import Nominatim
from rest_framework import generics, permissions, serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.views import APIView

from .filters import CustomInBBoxFilter
from .models import Delivery, Item, Request, UserProfile, VolunteerLocation
from .notifications import send_donation_notification_to_volunteers
from .serializers import (
    ItemSerializer,
    RequestSerializer,
    RequestStatusUpdateSerializer,
    UserProfileSerializer,
    VolunteerLocationSerializer,
)

logger = logging.getLogger(__name__)


def _role_required(user, expected_role):
    return getattr(user, 'role', None) == expected_role


def _live_items_queryset(queryset):
    return queryset.filter(is_available=True, expiry_date__gte=timezone.localdate())


def _sync_delivery_to_request(delivery):
    request_obj = delivery.request
    request_obj.volunteer = delivery.volunteer
    request_obj.delivery_status = delivery.status
    update_fields = ['volunteer', 'delivery_status', 'updated_at']
    if delivery.status == 'assigned' and not request_obj.assigned_at:
        request_obj.assigned_at = timezone.now()
        update_fields.append('assigned_at')
    if delivery.status == 'delivered':
        request_obj.completed_at = timezone.now()
        update_fields.append('completed_at')
    request_obj.save(update_fields=update_fields)


def _build_tracking_note(status):
    notes = {
        'pending': 'Request accepted. Waiting for volunteer assignment.',
        'assigned': 'Volunteer assigned and heading to pickup location.',
        'picked': 'Food picked up successfully.',
        'delivering': 'Volunteer is on the way.',
        'delivered': 'Delivery completed.',
    }
    return notes.get(status, 'Live update in progress.')


def _simulate_progress_coordinates(delivery):
    """
    Simulate a volunteer position when real GPS data is unavailable.
    """
    item = delivery.request.item
    pickup_lat = item.latitude
    pickup_lng = item.longitude
    recipient_lat = delivery.request.recipient_latitude
    recipient_lng = delivery.request.recipient_longitude

    if pickup_lat is None or pickup_lng is None:
        return None, None

    if delivery.status == 'assigned':
        jitter = 0.0012
        return (
            pickup_lat + random.uniform(-jitter, jitter),
            pickup_lng + random.uniform(-jitter, jitter),
        )

    # Exactly at pickup when volunteer confirms pickup.
    if delivery.status == 'picked':
        return pickup_lat, pickup_lng

    # Keep courier anchored at pickup for the volunteer-side "delivering" view.
    if delivery.status == 'delivering':
        return pickup_lat, pickup_lng

    if recipient_lat is None or recipient_lng is None:
        return pickup_lat, pickup_lng

    # Move along a simple linear path from pickup to recipient.
    progress = 1.0
    lat = pickup_lat + (recipient_lat - pickup_lat) * progress
    lng = pickup_lng + (recipient_lng - pickup_lng) * progress
    return lat, lng


def _apply_delivery_status_update(delivery, new_status):
    now = timezone.now()
    delivery.status = new_status
    if new_status == 'assigned':
        delivery.assigned_at = delivery.assigned_at or now
    elif new_status == 'picked':
        delivery.picked_at = now
    elif new_status == 'delivering':
        delivery.on_the_way_at = now
    elif new_status == 'delivered':
        delivery.delivered_at = now

    simulated_lat, simulated_lng = _simulate_progress_coordinates(delivery)
    if simulated_lat is not None and simulated_lng is not None:
        delivery.current_latitude = simulated_lat
        delivery.current_longitude = simulated_lng
        if delivery.volunteer_id:
            VolunteerLocation.objects.update_or_create(
                volunteer=delivery.volunteer,
                defaults={'latitude': simulated_lat, 'longitude': simulated_lng},
            )

    delivery.tracking_note = _build_tracking_note(new_status)
    delivery.save()
    _sync_delivery_to_request(delivery)
    return delivery


def _auto_assign_volunteer_if_available(request_obj):
    volunteer = (
        UserProfile.objects.filter(role='volunteer')
        .annotate(active_deliveries=Count('delivery_assignments', filter=~Q(delivery_assignments__status='delivered')))
        .order_by('active_deliveries', 'id')
        .first()
    )
    if not volunteer:
        return None

    delivery = Delivery.objects.get(request=request_obj)
    delivery.volunteer = volunteer
    _apply_delivery_status_update(delivery, 'assigned')
    return delivery


class GeocodeView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        address = (request.data.get('address') or '').strip()
        if not address:
            return Response({'error': 'Address is required.'}, status=status.HTTP_400_BAD_REQUEST)

        geolocator = Nominatim(user_agent="shareplate_backend")
        try:
            result = geolocator.geocode(address, timeout=10)
        except Exception as exc:
            logger.error("Geocoding error for %s: %s", address, exc, exc_info=True)
            return Response({'error': 'Geocoding failed.'}, status=status.HTTP_502_BAD_GATEWAY)

        if not result:
            return Response({'error': 'No location found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(
            {
                'lat': result.latitude,
                'lng': result.longitude,
                'formatted_address': getattr(result, 'address', address),
            }
        )


class ItemListCreateView(generics.ListCreateAPIView):
    serializer_class = ItemSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [CustomInBBoxFilter]
    bbox_filter_field = 'location'

    def get_queryset(self):
        queryset = Item.objects.select_related('donor').order_by('-created_at')
        mine = self.request.query_params.get('mine')
        if mine == '1' and self.request.user.is_authenticated:
            return _live_items_queryset(queryset.filter(donor=self.request.user))
        return _live_items_queryset(queryset)

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        item = serializer.save(donor=self.request.user)
        try:
            send_donation_notification_to_volunteers(item)
        except Exception as exc:
            logger.error("Failed to send notification to volunteers: %s", exc, exc_info=True)


class ItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    queryset = Item.objects.select_related('donor')

    def update(self, request, *args, **kwargs):
        item = self.get_object()
        if item.donor_id != request.user.id:
            return Response({'error': 'Only the donor can edit this donation.'}, status=status.HTTP_403_FORBIDDEN)
        if not item.is_available:
            return Response({'error': 'Claimed donations cannot be edited.'}, status=status.HTTP_409_CONFLICT)
        if item.expiry_date < timezone.localdate():
            return Response({'error': 'Expired donations cannot be edited.'}, status=status.HTTP_409_CONFLICT)

        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(item, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        if item.donor_id != request.user.id:
            return Response({'error': 'Only the donor can cancel this donation.'}, status=status.HTTP_403_FORBIDDEN)

        active_request = item.requests.exclude(delivery_status='delivered').first()
        if active_request and active_request.volunteer_id and active_request.delivery_status in {'picked', 'delivering'}:
            return Response(
                {'error': 'This donation is already in transit and can no longer be cancelled.'},
                status=status.HTTP_409_CONFLICT,
            )

        item.delete()
        return Response({'message': 'Donation cancelled successfully.'}, status=status.HTTP_200_OK)


class UserRegistrationView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = UserProfileSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            user = serializer.save()
            password = request.data.get('password')
            if password:
                user.set_password(password)
                user.save(update_fields=['password'])

            token, _ = Token.objects.get_or_create(user=user)
            user_data = UserProfileSerializer(user).data
            user_data.pop('password', None)

        return Response(
            {
                'user': user_data,
                'token': token.key,
                'message': 'User registered successfully',
            },
            status=status.HTTP_201_CREATED,
        )


class UserListView(generics.ListAPIView):
    queryset = UserProfile.objects.all().order_by('email')
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        role = self.request.query_params.get('role')
        email = self.request.query_params.get('email')
        if role:
            queryset = queryset.filter(role=role)
        if email:
            queryset = queryset.filter(email=email)
        return queryset


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)


class ObtainAuthToken(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {'error': 'Please provide both email and password'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, email=email, password=password)
        if not user:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_400_BAD_REQUEST)

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                'token': token.key,
                'user': UserProfileSerializer(user).data,
                'role': user.role,
                'name': user.get_full_name() or user.first_name or user.email,
            }
        )


class RequestListCreateView(generics.ListCreateAPIView):
    serializer_class = RequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = Request.objects.select_related(
            'item',
            'item__donor',
            'requester',
            'volunteer',
        ).order_by('-updated_at', '-created_at')
        role = getattr(self.request.user, 'role', None)
        scope = self.request.query_params.get('scope')

        if scope == 'all' and role == 'volunteer':
            return queryset.filter(status='Accepted')
        if role == 'donor':
            return queryset.filter(item__donor=self.request.user)
        if role == 'volunteer':
            return queryset.filter(Q(volunteer=self.request.user) | Q(volunteer__isnull=True, status='Accepted'))
        return queryset.filter(requester=self.request.user)

    def perform_create(self, serializer):
        if not self.request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required.")
        with transaction.atomic():
            item = serializer.validated_data['item']
            if not item.is_available or item.expiry_date < timezone.localdate():
                raise serializers.ValidationError("This item is no longer available.")

            created_request = serializer.save(
                requester=self.request.user,
                status='Accepted',
                delivery_status='pending',
                recipient_latitude=serializer.validated_data.get('recipient_latitude'),
                recipient_longitude=serializer.validated_data.get('recipient_longitude'),
            )
            item.is_available = False
            item.save(update_fields=['is_available'])
            Delivery.objects.create(
                request=created_request,
                status='pending',
                tracking_note='Request accepted. Waiting for volunteer assignment.',
            )
            _auto_assign_volunteer_if_available(created_request)


class RequestDetailView(generics.RetrieveUpdateAPIView):
    queryset = Request.objects.select_related('item', 'item__donor', 'requester', 'volunteer')
    serializer_class = RequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PATCH', 'PUT'):
            return RequestStatusUpdateSerializer
        return RequestSerializer

    def update(self, request, *args, **kwargs):
        delivery_request = self.get_object()
        user = request.user
        role = getattr(user, 'role', None)
        action = request.data.get('action')

        if action == 'cancel':
            if delivery_request.requester_id != user.id:
                return Response({'error': 'Only the user who claimed this donation can cancel the claim.'}, status=status.HTTP_403_FORBIDDEN)
            if delivery_request.delivery_status in {'picked', 'delivering', 'delivered'}:
                return Response(
                    {'error': 'This claim can no longer be cancelled because delivery is already in progress.'},
                    status=status.HTTP_409_CONFLICT,
                )

            with transaction.atomic():
                item = delivery_request.item
                item.is_available = True
                item.save(update_fields=['is_available'])
                delivery_request.delete()

            return Response({'message': 'Claim cancelled successfully.'}, status=status.HTTP_200_OK)

        if role == 'volunteer' and action == 'claim':
            if delivery_request.volunteer and delivery_request.volunteer != user:
                return Response({'error': 'This delivery is already assigned.'}, status=status.HTTP_409_CONFLICT)
            delivery, _ = Delivery.objects.get_or_create(
                request=delivery_request,
                defaults={'status': 'assigned', 'tracking_note': 'Volunteer assigned.'}
            )
            delivery.volunteer = user
            _apply_delivery_status_update(delivery, 'assigned')
            delivery_request.refresh_from_db()
            return Response(RequestSerializer(delivery_request).data)

        if role == 'volunteer':
            if delivery_request.volunteer_id != user.id:
                return Response({'error': 'Only the assigned volunteer can update this delivery.'}, status=status.HTTP_403_FORBIDDEN)

            serializer = self.get_serializer(delivery_request, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            new_status = serializer.validated_data['delivery_status']
            delivery, _ = Delivery.objects.get_or_create(request=delivery_request)
            _apply_delivery_status_update(delivery, new_status)
            delivery_request.refresh_from_db()
            return Response(RequestSerializer(delivery_request).data)

        return Response({'error': 'This action is not allowed for your role.'}, status=status.HTTP_403_FORBIDDEN)


class VolunteerLocationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if request.user.role != 'volunteer':
            return Response({'error': 'Volunteer access only.'}, status=status.HTTP_403_FORBIDDEN)

        location, _ = VolunteerLocation.objects.get_or_create(volunteer=request.user)
        return Response(VolunteerLocationSerializer(location).data)

    def post(self, request):
        if request.user.role != 'volunteer':
            return Response({'error': 'Volunteer access only.'}, status=status.HTTP_403_FORBIDDEN)

        location, _ = VolunteerLocation.objects.get_or_create(volunteer=request.user)
        serializer = VolunteerLocationSerializer(location, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(volunteer=request.user)
        return Response(serializer.data)


class DashboardSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = getattr(user, 'role', None)

        if role == 'donor':
            items = Item.objects.filter(donor=user)
            requests = Request.objects.filter(item__donor=user)
            data = {
                'role': role,
                'active_donations': _live_items_queryset(items).count(),
                'fulfilled_donations': items.exclude(
                    is_available=True,
                    expiry_date__gte=timezone.localdate(),
                ).count(),
                'total_requests': requests.count(),
                'delivered_requests': requests.filter(delivery_status='delivered').count(),
            }
        elif role == 'volunteer':
            requests = Request.objects.filter(Q(volunteer=user) | Q(volunteer__isnull=True, status='Accepted'))
            active = requests.exclude(delivery_status='delivered')
            data = {
                'role': role,
                'open_deliveries': requests.filter(volunteer__isnull=True, status='Accepted').count(),
                'my_active_deliveries': active.filter(volunteer=user).count(),
                'completed_deliveries': requests.filter(volunteer=user, delivery_status='delivered').count(),
                'response_rate': requests.filter(volunteer=user).count(),
            }
        else:
            requests = Request.objects.filter(requester=user)
            delivered = requests.filter(delivery_status='delivered').count()
            data = {
                'role': role,
                'claims_made': requests.count(),
                'active_claims': requests.exclude(delivery_status='delivered').count(),
                'delivered_claims': delivered,
                'reliability_score': min(98, 72 + delivered * 4),
            }

        network_counts = Request.objects.aggregate(
            total_requests=Count('id'),
            delivered_requests=Count('id', filter=Q(delivery_status='delivered')),
            active_deliveries=Count('id', filter=~Q(delivery_status='delivered')),
        )
        data['network'] = network_counts
        data['server_time'] = timezone.now()
        return Response(data)


class AssignVolunteerView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _role_required(request.user, 'volunteer'):
            return Response({'error': 'Volunteer access only.'}, status=status.HTTP_403_FORBIDDEN)

        request_id = request.data.get('request_id')
        if not request_id:
            return Response({'error': 'request_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            request_obj = Request.objects.select_related('volunteer').get(pk=request_id)
        except Request.DoesNotExist:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

        delivery, _ = Delivery.objects.get_or_create(
            request=request_obj,
            defaults={'status': 'assigned', 'tracking_note': 'Volunteer assigned.'}
        )
        if delivery.volunteer and delivery.volunteer_id != request.user.id:
            return Response({'error': 'Delivery is already assigned.'}, status=status.HTTP_409_CONFLICT)

        delivery.volunteer = request.user
        _apply_delivery_status_update(delivery, 'assigned')
        request_obj.refresh_from_db()
        return Response(RequestSerializer(request_obj).data, status=status.HTTP_200_OK)


class UpdateDeliveryStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _role_required(request.user, 'volunteer'):
            return Response({'error': 'Volunteer access only.'}, status=status.HTTP_403_FORBIDDEN)

        request_id = request.data.get('request_id')
        delivery_status = request.data.get('status')
        if not request_id or not delivery_status:
            return Response({'error': 'request_id and status are required.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = {'assigned', 'picked', 'delivering', 'delivered'}
        if delivery_status not in valid_statuses:
            return Response({'error': 'Invalid status.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            request_obj = Request.objects.get(pk=request_id)
        except Request.DoesNotExist:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)

        delivery, _ = Delivery.objects.get_or_create(request=request_obj)
        if delivery.volunteer_id and delivery.volunteer_id != request.user.id:
            return Response({'error': 'Only assigned volunteer can update status.'}, status=status.HTTP_403_FORBIDDEN)
        if not delivery.volunteer_id:
            delivery.volunteer = request.user

        _apply_delivery_status_update(delivery, delivery_status)

        request_obj.refresh_from_db()
        return Response(RequestSerializer(request_obj).data, status=status.HTTP_200_OK)
