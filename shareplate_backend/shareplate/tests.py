from datetime import timedelta
from unittest.mock import patch

from django.urls import reverse
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import Item, Request, UserProfile


class AuthFlowTests(APITestCase):
    def test_login_returns_user_payload(self):
        user = UserProfile.objects.create_user(
            email="donor@example.com",
            password="strong-pass",
            first_name="Asha",
            role="donor",
        )

        response = self.client.post(
            reverse("api-token-auth"),
            {"email": "donor@example.com", "password": "strong-pass"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["role"], "donor")
        self.assertEqual(response.data["user"]["email"], user.email)


class VolunteerWorkflowTests(APITestCase):
    def setUp(self):
        self.geocode_patcher = patch("shareplate.models.Nominatim.geocode", return_value=None)
        self.geocode_patcher.start()
        self.donor = UserProfile.objects.create_user(
            email="donor@example.com",
            password="donor-pass",
            role="donor",
        )
        self.recipient = UserProfile.objects.create_user(
            email="recipient@example.com",
            password="recipient-pass",
            role="recipient",
        )
        self.volunteer = UserProfile.objects.create_user(
            email="volunteer@example.com",
            password="volunteer-pass",
            role="volunteer",
        )
        self.item = Item.objects.create(
            name="Vegetable Curry",
            description="Freshly packed meals",
            address="Sector 62, Noida",
            quantity=10,
            expiry_date=timezone.localdate() + timedelta(days=1),
            donor=self.donor,
            latitude=28.627,
            longitude=77.364,
        )

    def tearDown(self):
        self.geocode_patcher.stop()

    def test_claim_and_complete_delivery_flow(self):
        recipient_token = Token.objects.create(user=self.recipient)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {recipient_token.key}")
        create_response = self.client.post(
            reverse("request-list-create"),
            {
                "item": self.item.id,
                "recipient_latitude": 28.6129,
                "recipient_longitude": 77.2295,
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        request_id = create_response.data["id"]
        self.assertEqual(create_response.data["recipient_location"]["latitude"], 28.6129)
        self.item.refresh_from_db()
        self.assertFalse(self.item.is_available)

        volunteer_token = Token.objects.create(user=self.volunteer)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {volunteer_token.key}")

        claim_response = self.client.patch(
            reverse("request-detail", kwargs={"pk": request_id}),
            {"action": "claim"},
            format="json",
        )
        self.assertEqual(claim_response.status_code, 200)
        self.assertEqual(claim_response.data["delivery_status"], "assigned")

        deliver_response = self.client.patch(
            reverse("request-detail", kwargs={"pk": request_id}),
            {"delivery_status": "delivered"},
            format="json",
        )
        self.assertEqual(deliver_response.status_code, 200)

        request_obj = Request.objects.get(pk=request_id)
        self.assertEqual(request_obj.delivery_status, "delivered")
        self.assertIsNotNone(request_obj.completed_at)
        self.assertEqual(request_obj.recipient_latitude, 28.6129)

    def test_recipient_request_auto_assigns_volunteer(self):
        recipient_token = Token.objects.create(user=self.recipient)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {recipient_token.key}")
        create_response = self.client.post(
            reverse("request-list-create"),
            {
                "item": self.item.id,
                "recipient_latitude": 28.6129,
                "recipient_longitude": 77.2295,
            },
            format="json",
        )

        self.assertEqual(create_response.status_code, 201)
        request_obj = Request.objects.get(pk=create_response.data["id"])
        self.assertEqual(request_obj.delivery_status, "assigned")
        self.assertIsNotNone(request_obj.volunteer_id)


class RoleGuardTests(APITestCase):
    def setUp(self):
        self.geocode_patcher = patch("shareplate.models.Nominatim.geocode", return_value=None)
        self.geocode_patcher.start()
        self.donor = UserProfile.objects.create_user(email="donor2@example.com", password="pass", role="donor")
        self.recipient = UserProfile.objects.create_user(email="recipient2@example.com", password="pass", role="recipient")

    def tearDown(self):
        self.geocode_patcher.stop()

    def test_authenticated_user_can_add_food(self):
        recipient_token = Token.objects.create(user=self.recipient)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {recipient_token.key}")
        response = self.client.post(
            reverse("add-food"),
            {
                "name": "Rice Meal Box",
                "description": "Test meal",
                "address": "Sector 18, Noida",
                "quantity": 4,
                "expiry_date": (timezone.localdate() + timedelta(days=1)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["name"], "Rice Meal Box")

    def test_authenticated_user_can_request_food(self):
        item = Item.objects.create(
            name="Dal",
            description="Fresh",
            address="Noida",
            quantity=3,
            expiry_date=timezone.localdate() + timedelta(days=1),
            donor=self.donor,
            latitude=28.627,
            longitude=77.364,
        )
        donor_token = Token.objects.create(user=self.donor)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {donor_token.key}")
        response = self.client.post(reverse("request-food"), {"item": item.id}, format="json")
        self.assertEqual(response.status_code, 201)
