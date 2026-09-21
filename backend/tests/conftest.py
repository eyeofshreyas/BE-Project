"""Shared test fixtures/helpers."""


class ImmediateBackgroundTasks:
    """Stand-in for fastapi.BackgroundTasks in unit tests that call a controller directly:
    runs each task synchronously instead of after a response, since there's no ASGI
    lifecycle here to fire it for real."""

    def add_task(self, func, *args, **kwargs):
        func(*args, **kwargs)
