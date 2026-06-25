"""
tasks_scheduled.py — Celery Beat scheduled tasks

Currently the geo-scheduler container is running but doing nothing.
This file fixes that.

Schedule:
  Every 6 hours  — rescan all active brands
  Every 6 hours  — run analyst agent after scans complete
  Every day 9am  — send visibility report via Telegram (if token configured)
  Every day 2am  — prune stale scan data (keep last 90 days, protect disk)

Memory note (Minisforum 98GB disk, 30GB free):
  Each scan row ~ 2–5KB with embedding (vector 768 floats = 3KB).
  At 5 engines × 5 queries × 10 brands = 250 scans/run.
  At 4 runs/day = 1000 scans/day = ~5MB/day.
  30GB free = ~6000 days of headroom. Not a concern YET.
  But the 2am prune keeps it clean anyway — good habit.

n8n integration:
  We POST a webhook to n8n after each scheduled scan batch completes.
  n8n can then trigger downstream flows (Slack, email, CRM, etc).
  Set N8N_WEBHOOK_URL in .env to enable. No-op if not set.

Boris principle: the schedule is data, not code.
  CELERYBEAT_SCHEDULE is a dict. Easy to read, easy to change.
  No decorators scattered across files.
"""

import os
import json
import httpx
from datetime import datetime
from celery import Celery
from celery.schedules import crontab
from app.worker import celery_app
from app.core.database import execute_query, execute_write


# ── Schedule definition ───────────────────────────────────────────────────────

celery_app.conf.beat_schedule = {

    # Rescan all brands every 6 hours
    "rescan-all-brands": {
        "task":     "app.tasks_scheduled.rescan_all_brands",
        "schedule": crontab(minute=0, hour="*/6"),
        "options":  {"queue": "default"},
    },

    # Run analyst on all brands 30min after rescan starts
    # (gives scans time to complete)
    "run-analyst-all-brands": {
        "task":     "app.tasks_scheduled.run_analyst_all_brands",
        "schedule": crontab(minute=30, hour="*/6"),
        "options":  {"queue": "default"},
    },

    # Daily visibility digest to Telegram at 9am UTC
    "daily-digest": {
        "task":     "app.tasks_scheduled.send_daily_digest",
        "schedule": crontab(minute=0, hour=9),
        "options":  {"queue": "default"},
    },

    # Prune old data at 2am UTC — keep disk clean
    "prune-old-scans": {
        "task":     "app.tasks_scheduled.prune_old_scans",
        "schedule": crontab(minute=0, hour=2),
        "options":  {"queue": "default"},
    },
}

celery_app.conf.timezone = "UTC"


# ── Tasks ─────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks_scheduled.rescan_all_brands")
def rescan_all_brands() -> dict:
    """
    Rescan every brand in the DB with its last-used queries.
    Pulls queries from the most recent scans per brand.
    No queries stored? Skip that brand.
    """
    from app.services.geo_engine import run_geo_scan

    brands = execute_query(
        "SELECT id, name FROM brands ORDER BY created_at"
    )
    if not brands:
        return {"status": "no_brands"}

    results = []
    for brand_id, brand_name in brands:
        # Get the distinct queries used in the last scan session
        query_rows = execute_query("""
            SELECT DISTINCT query
            FROM engine_scans
            WHERE brand_id = %s
            ORDER BY query
            LIMIT 10
        """, (str(brand_id),))

        queries = [r[0] for r in query_rows]
        if not queries:
            results.append({"brand": brand_name, "status": "skipped_no_queries"})
            continue

        try:
            result = run_geo_scan(str(brand_id), queries)
            # Save visibility snapshot for trend chart
            from app.core.database import execute_write as ew
            try:
                ew("""
                    INSERT INTO visibility_snapshots
                        (brand_id, visibility_score, total_scans, total_mentions)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (brand_id, snapshot_date)
                    DO UPDATE SET
                        visibility_score = EXCLUDED.visibility_score,
                        total_scans = EXCLUDED.total_scans,
                        total_mentions = EXCLUDED.total_mentions
                """, (
                    str(brand_id),
                    result.get("visibility_score", 0),
                    result.get("total_scans", 0),
                    result.get("times_mentioned", 0),
                ))
            except Exception:
                pass  # never crash rescan over snapshot failure
            results.append({
                "brand":      brand_name,
                "status":     "ok",
                "visibility": result.get("visibility_score"),
            })
        except Exception as e:
            results.append({"brand": brand_name, "status": "error", "error": str(e)})

    # Notify n8n if configured
    _ping_n8n_webhook("rescan_complete", {"brands_scanned": len(results), "results": results})

    return {"status": "complete", "scanned": len(results), "results": results}


@celery_app.task(name="app.tasks_scheduled.run_analyst_all_brands")
def run_analyst_all_brands() -> dict:
    """
    Run analyst agent on every brand that has scans.
    Auto-scores each recommendation and saves to feedback_store.
    This is what makes the system self-improving over time.
    """
    from app.services.analyst_agent import run_analyst_agent
    from app.services.feedback_store import auto_score_and_save

    brands = execute_query(
        """SELECT DISTINCT es.brand_id FROM engine_scans es
           JOIN brands b ON es.brand_id = b.id
           JOIN organisations o ON b.org_id = o.id
           WHERE o.auto_scan = true"""
    )
    if not brands:
        return {"status": "no_scan_data"}

    results = []
    for (brand_id,) in brands:
        try:
            org_rows = execute_query(
                "SELECT org_id FROM brands WHERE id = %s", (str(brand_id),)
            )
            org_id = str(org_rows[0][0]) if org_rows and org_rows[0][0] else None
            report = run_analyst_agent(str(brand_id), org_id=org_id)

            # Auto-score every recommendation — feeds the self-learning loop
            scores = []
            for rec in report.recommendations:
                score, fid = auto_score_and_save(
                    agent_name="analyst_agent",
                    output_text=rec.recommendation,
                    context_summary=f"{report.brand_name} — {rec.engine} — {rec.query}",
                    evidence=rec.evidence,
                )
                scores.append(score)

            avg_score = round(sum(scores) / len(scores), 2) if scores else 0
            results.append({
                "brand_id":   str(brand_id),
                "brand":      report.brand_name,
                "recs":       len(report.recommendations),
                "avg_score":  avg_score,
                "visibility": report.visibility_score,
            })
        except Exception as e:
            results.append({"brand_id": str(brand_id), "status": "error", "error": str(e)})

    _ping_n8n_webhook("analyst_complete", {"brands_analyzed": len(results), "results": results})

    return {"status": "complete", "analyzed": len(results), "results": results}


@celery_app.task(name="app.tasks_scheduled.send_daily_digest")
def send_daily_digest() -> dict:
    """
    Send a Telegram digest: visibility scores for all brands.
    Human oversight hook — you see what changed overnight.
    Skipped silently if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set.
    """
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return {"status": "skipped_no_telegram_config"}

    # Gather yesterday vs today visibility per brand
    rows = execute_query("""
        SELECT
            b.name,
            ROUND(
                100.0 * SUM(CASE WHEN es.brand_mentioned THEN 1 ELSE 0 END)
                / NULLIF(COUNT(*), 0), 1
            ) AS visibility_today,
            (
                SELECT ROUND(
                    100.0 * SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)
                    / NULLIF(COUNT(*), 0), 1
                )
                FROM engine_scans
                WHERE brand_id = b.id
                  AND scanned_at::date = CURRENT_DATE - 1
            ) AS visibility_yesterday
        FROM brands b
        LEFT JOIN engine_scans es
            ON es.brand_id = b.id
            AND es.scanned_at::date = CURRENT_DATE
        GROUP BY b.id, b.name
        ORDER BY b.name
    """)

    lines = ["📊 *GEO Daily Digest*\n"]
    for name, today, yesterday in rows:
        today = float(today or 0)
        yesterday = float(yesterday or 0)
        delta = today - yesterday
        arrow = "↑" if delta > 0 else ("↓" if delta < 0 else "→")
        lines.append(f"*{name}*: {today}% {arrow} ({delta:+.1f}%)")

    # Top recommendation due today
    critical_rows = execute_query("""
        SELECT b.name, r.recommendation
        FROM recommendations r
        JOIN brands b ON b.id = r.brand_id
        WHERE r.priority = 'critical' AND r.status = 'pending'
        ORDER BY r.created_at DESC
        LIMIT 1
    """)
    if critical_rows:
        lines.append(f"\n🔴 *Critical action*: {critical_rows[0][0]}\n{critical_rows[0][1]}")

    message = "\n".join(lines)

    try:
        with httpx.Client(timeout=10) as http:
            http.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id":    chat_id,
                    "text":       message,
                    "parse_mode": "Markdown",
                }
            )
        return {"status": "sent", "brands": len(rows)}
    except Exception as e:
        return {"status": "error", "error": str(e)}


@celery_app.task(name="app.tasks_scheduled.prune_old_scans")
def prune_old_scans(keep_days: int = 90) -> dict:
    """
    Delete scans older than keep_days.
    Keeps the last scan per brand+engine+query regardless of age
    (so we never lose all history for a brand).

    Disk math (Minisforum 98GB, 30GB free):
    At current growth rate (~5MB/day) this prune runs before we'd ever
    notice. But it's good hygiene — disk is the one constrained resource.
    """
    execute_write("""
        DELETE FROM engine_scans
        WHERE scanned_at < NOW() - INTERVAL '%s days'
          AND id NOT IN (
            SELECT DISTINCT ON (brand_id, engine_name, query) id
            FROM engine_scans
            ORDER BY brand_id, engine_name, query, scanned_at DESC
          )
    """, (keep_days,))

    # Report how much is left
    rows = execute_query("SELECT COUNT(*), pg_size_pretty(pg_total_relation_size('engine_scans'))")
    count = int(rows[0][0]) if rows else 0
    size = rows[0][1] if rows else "unknown"

    return {
        "status":      "pruned",
        "rows_kept":   count,
        "table_size":  size,
        "keep_days":   keep_days,
    }


# ── n8n integration ───────────────────────────────────────────────────────────

def _ping_n8n_webhook(event: str, payload: dict) -> None:
    """
    Fire-and-forget POST to n8n webhook.
    n8n picks this up and can route to Slack, email, CRM, etc.

    To enable: set N8N_WEBHOOK_URL in .env
    Example: N8N_WEBHOOK_URL=http://localhost:5678/webhook/geo-events

    No-op if not configured — zero coupling.
    """
    url = os.getenv("N8N_WEBHOOK_URL", "")
    if not url:
        return
    try:
        with httpx.Client(timeout=5) as http:
            http.post(url, json={"event": event, "payload": payload, "ts": datetime.utcnow().isoformat()})
    except Exception:
        pass  # n8n is optional — never crash the pipeline over it
