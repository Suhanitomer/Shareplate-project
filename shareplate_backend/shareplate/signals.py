import resend
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .models import UserProfile

@receiver(post_save, sender=UserProfile)
def send_admin_verification_email(sender, instance, created, **kwargs):
    if created and instance.role in ['donor', 'recipient']:
        resend.api_key = settings.RESEND_API_KEY

        subject = f"New {instance.role.capitalize()} Registration: Pending Verification"
        html_content = f"""
        <h2>New {instance.role.capitalize()} Registration — Pending Verification</h2>
        <p>A new {instance.role} has registered on SharePlate and is waiting for verification.</p>
        <ul>
            <li><b>Name:</b> {instance.first_name} {instance.last_name}</li>
            <li><b>Email:</b> {instance.email}</li>
            <li><b>Role:</b> {instance.role.capitalize()}</li>
        </ul>
        <a href="http://localhost:8000/admin/shareplate/userprofile/{instance.id}/change/" 
           style="background:#16a34a;color:white;padding:10px 20px;
                  border-radius:6px;text-decoration:none;display:inline-block;">
          Verify Now
        </a>
        """

        try:
            resend.Emails.send({
                "from": "onboarding@resend.dev",
                "to": settings.ADMIN_EMAILS,
                "subject": subject,
                "html": html_content
            })
        except Exception as e:
            # We don't want the user creation to fail if the email fails,
            # but we should log it.
            print(f"Failed to send verification email via Resend: {e}")
