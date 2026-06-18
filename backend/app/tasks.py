from app.worker import celery_app
from app.services.geo_engine import run_geo_scan

@celery_app.task(name="app.tasks.scan_brand")
def scan_brand_task(brand_id: str, queries: list):
    return run_geo_scan(brand_id, queries)
