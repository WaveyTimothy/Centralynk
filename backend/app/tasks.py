from app.worker import celery_app
from app.services.geo_engine import run_geo_scan, run_competitor_benchmark

@celery_app.task(name="app.tasks.scan_brand")
def scan_brand_task(brand_id: str, queries: list):
    return run_geo_scan(brand_id, queries)

@celery_app.task(name="app.tasks.competitor_benchmark_task")
def competitor_benchmark_task(brand_id: str, org_id: str):
    return run_competitor_benchmark(brand_id, org_id=org_id)
