from django.db import migrations

def verify_existing_users(apps, schema_editor):
    UserProfile = apps.get_model('shareplate', 'UserProfile')
    # Grandfather in all existing users by setting is_verified to True
    UserProfile.objects.all().update(is_verified=True)

def revert_verification(apps, schema_editor):
    UserProfile = apps.get_model('shareplate', 'UserProfile')
    # Revert all users to unverified (as they were before this migration)
    UserProfile.objects.all().update(is_verified=False)

class Migration(migrations.Migration):

    dependencies = [
        ('shareplate', '0010_remove_delivery_volunteer_remove_request_volunteer_and_more'),
    ]

    operations = [
        migrations.RunPython(verify_existing_users, revert_verification),
    ]
