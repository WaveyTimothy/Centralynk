"""
tasks_marketing.py — Marketing agent scheduled tasks + API endpoints

Schedule:
  Every Monday 8am  — generate blog post draft
  Every Wednesday 8am — generate Reddit comment draft
  Every Friday 8am  — generate LinkedIn post draft

All outputs go to pending_approvals for Oscar to review.
Nothing is published automatically — human-in-the-loop always.

Wire into worker.py:
  import app.tasks_marketing
"""

from app.worker import celery_app
from celery.schedules import crontab


# ── Add to beat schedule ──────────────────────────────────────────────────────

celery_app.conf.beat_schedule.update({

    "weekly-blog-post": {
        "task":     "app.tasks_marketing.generate_blog_post",
        "schedule": crontab(minute=0, hour=8, day_of_week=1),  # Monday
        "options":  {"queue": "default"},
    },

    "weekly-reddit-comment": {
        "task":     "app.tasks_marketing.generate_reddit_comment",
        "schedule": crontab(minute=0, hour=8, day_of_week=3),  # Wednesday
        "options":  {"queue": "default"},
    },

    "weekly-linkedin-post": {
        "task":     "app.tasks_marketing.generate_linkedin_post",
        "schedule": crontab(minute=0, hour=8, day_of_week=5),  # Friday
        "options":  {"queue": "default"},
    },
})


# ── Celery tasks ──────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks_marketing.generate_blog_post")
def generate_blog_post() -> dict:
    from app.services.marketing_agent import run_marketing_agent
    return run_marketing_agent(content_type="blog_post")


@celery_app.task(name="app.tasks_marketing.generate_reddit_comment")
def generate_reddit_comment() -> dict:
    from app.services.marketing_agent import run_marketing_agent
    return run_marketing_agent(content_type="reddit_comment")


@celery_app.task(name="app.tasks_marketing.generate_linkedin_post")
def generate_linkedin_post() -> dict:
    from app.services.marketing_agent import run_marketing_agent
    return run_marketing_agent(content_type="linkedin_post")


@celery_app.task(name="app.tasks_marketing.generate_video_script")
def generate_video_script() -> dict:
    from app.services.marketing_agent import run_marketing_agent
    return run_marketing_agent(content_type="video_script")


# ── FastAPI endpoints to add to main.py ──────────────────────────────────────
"""
Add these to backend/app/main.py:

from app.services.marketing_agent import (
    run_marketing_agent, get_pending_content,
    approve_content, reject_content
)

# Generate content on demand
@app.post("/api/marketing/generate")
def generate_marketing_content(body: dict, admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    content_type = body.get("content_type", "blog_post")
    custom_spec = body.get("spec")
    return run_marketing_agent(content_type=content_type, custom_spec=custom_spec)

# Get pending approvals
@app.get("/api/marketing/pending")
def get_pending_marketing(content_type: str = None, admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return get_pending_content(content_type)

# Approve a piece
@app.post("/api/marketing/{approval_id}/approve")
def approve_marketing(approval_id: str, body: dict = {}, admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return approve_content(approval_id, body.get("notes", ""))

# Reject a piece
@app.post("/api/marketing/{approval_id}/reject")
def reject_marketing(approval_id: str, body: dict = {}, admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    return reject_content(approval_id, body.get("reason", ""))

# Get full content by id (for reading in admin)
@app.get("/api/marketing/{approval_id}")
def get_marketing_content(approval_id: str, admin_key: str = ""):
    if admin_key != os.getenv("ADMIN_KEY"):
        raise HTTPException(status_code=403, detail="Invalid admin key")
    from app.core.database import execute_query
    rows = execute_query(
        "SELECT id::text, content_type, title, body, target_query, target_platform, status, created_at FROM pending_approvals WHERE id = %s",
        (approval_id,)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    r = rows[0]
    return {"id": r[0], "type": r[1], "title": r[2], "body": r[3],
            "query": r[4], "platform": r[5], "status": r[6], "created_at": str(r[7])}
"""

