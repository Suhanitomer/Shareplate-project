from django.apps import AppConfig


class ShareplateConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'shareplate'

    def ready(self):
        import shareplate.signals
