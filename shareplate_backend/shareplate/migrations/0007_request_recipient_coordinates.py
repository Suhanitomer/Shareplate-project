from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('shareplate', '0006_request_timestamps'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='recipient_latitude',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='request',
            name='recipient_longitude',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
