from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shareplate', '0005_alter_userprofile_options_remove_request_latitude_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='assigned_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='request',
            name='completed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='request',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
            preserve_default=False,
        ),
    ]
