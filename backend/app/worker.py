from celery import Celery
import os

celery_app = Celery(
    "geo_worker",
    broker=os.getenv("REDIS_URL", "redis://geo-redis:6379/0"),
    backend=os.getenv("REDIS_URL", "redis://geo-redis:6379/0"),
    include=["app.tasks"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

import app.tasks_scheduled
import app.tasks_marketing
