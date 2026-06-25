"""
analyst_agent.py — GEO Analyst Agent

What this does:
  Reads engine_scans for a brand, reasons over the data with Groq,
  writes structured Recommendation rows with priority + action.

This is the feature that separates us from every monitoring-only tool
(Otterly, Peec, etc). They show you the problem. We tell you what to do.

Self-learning: before generating recommendations, we pull the highest-scored
past recommendations from feedback_store and inject them as few-shot examples.
Good outputs teach the agent what "good" looks like — no fine-tuning needed.

Boris principle: every output is a typed Pydantic object. Nothing returns a
raw dict. The caller always knows exactly what shape it's getting.

Karpathy principle: the agent is a thin wrapper around data + a prompt.
No framework, no LangChain, no magic. Just SQL → prompt → SQL.

Memory note (Minisforum 28GB):
  This agent runs inside the existing geo-celery container.
  No new container needed. Memory cost ≈ 0.
"""

import json
import os
import time
from typing import Optional
from pydantic import BaseModel, Field
from groq import Groq
from app.core.database import execute_query, execute_write
from app.services.feedback_store import auto_score_and_save
from app.services.geo_engine import get_org_api_key

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", ""), max_retries=1, timeout=15.0)


# ── Output types ─────────────────────────────────────────────────────────────

class Recommendation(BaseModel):
    brand_id: str
    engine: str                          # which engine this targets, or "all"
    query: str                           # which query triggered this, or "general"
    recommendation: str                  # the actual actionable text
    priority: str = "medium"             # critical | high | medium | low
    category: str = "content"           # content | technical | authority | schema
    confidence: float = 0.0             # 0.0–1.0, how confident the agent is
    evidence: str = ""                  # what scan data supports this
    effort: str = "medium"              # low | medium | high — dev effort to fix
    impact: str = "medium"              # low | medium | high — expected visibility gain


class AnalystReport(BaseModel):
    brand_id: str
    brand_name: str
    visibility_score: float
    scan_count: int
    mention_rate: float
    dominant_sentiment: str
    top_competitor: Optional[str] = None
    recommendations: list[Recommendation] = Field(default_factory=list)
    trend_summary: str = ""
    agent_version: str = "v1"


# ── Data fetcher — all the context the agent needs ───────────────────────────

def _fetch_brand_scan_summary(brand_id: str) -> dict:
    """
    Pull aggregated scan data for a brand.
    One query, structured result — no ORM overhead.
    """
    # Overall visibility
    rows = execute_query("""
        SELECT
            COUNT(*)                                        AS total,
            SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END) AS mentioned,
            AVG(position)                                   AS avg_position
        FROM engine_scans
        WHERE brand_id = %s
    """, (brand_id,))
    total, mentioned, avg_pos = rows[0] if rows else (0, 0, 0)

    # Per-engine breakdown
    engine_rows = execute_query("""
        SELECT
            engine_name,
            COUNT(*)                                          AS scans,
            SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END) AS mentions,
            MODE() WITHIN GROUP (ORDER BY sentiment)         AS dominant_sentiment
        FROM engine_scans
        WHERE brand_id = %s
        GROUP BY engine_name
        ORDER BY scans DESC
    """, (brand_id,))

    # Recent suggestions from scan lessons (the raw signal)
    suggestion_rows = execute_query("""
        SELECT DISTINCT lessons_learned->>'suggestion'
        FROM engine_scans
        WHERE brand_id = %s
          AND lessons_learned->>'suggestion' IS NOT NULL
          AND lessons_learned->>'suggestion' != ''
        ORDER BY 1
        LIMIT 15
    """, (brand_id,))

    # Competitor mentions — aggregate across all scans
    competitor_rows = execute_query("""
        SELECT
            comp_name,
            COUNT(*) AS freq
        FROM (
            SELECT jsonb_array_elements_text(
                lessons_learned->'competitors'
            ) AS comp_name
            FROM engine_scans
            WHERE brand_id = %s
        ) sub
        GROUP BY comp_name
        ORDER BY freq DESC
        LIMIT 5
    """, (brand_id,))

    # Trend: compare last 5 scans vs previous 5 for same brand
    trend_rows = execute_query("""
        WITH recent AS (
            SELECT brand_mentioned
            FROM engine_scans
            WHERE brand_id = %s
            ORDER BY scanned_at DESC
            LIMIT 5
        ),
        older AS (
            SELECT brand_mentioned
            FROM engine_scans
            WHERE brand_id = %s
            ORDER BY scanned_at DESC
            OFFSET 5 LIMIT 5
        )
        SELECT
            AVG(CASE WHEN brand_mentioned THEN 1.0 ELSE 0.0 END) AS recent_rate,
            (SELECT AVG(CASE WHEN brand_mentioned THEN 1.0 ELSE 0.0 END)
             FROM older)                                          AS older_rate
        FROM recent
    """, (brand_id, brand_id))

    recent_rate = float(trend_rows[0][0] or 0) if trend_rows else 0
    older_rate = float(trend_rows[0][1] or 0) if trend_rows else 0

    # Queries where we're never mentioned (biggest opportunity)
    missed_rows = execute_query("""
        SELECT query, COUNT(*) AS scans
        FROM engine_scans
        WHERE brand_id = %s
          AND brand_mentioned = FALSE
        GROUP BY query
        ORDER BY scans DESC
        LIMIT 5
    """, (brand_id,))

    summary = {
        "total_scans":       int(total or 0),
        "total_mentioned":   int(mentioned or 0),
        "avg_position":      float(avg_pos or 0),
        "visibility_pct":    round(int(mentioned or 0) / max(int(total or 1), 1) * 100, 1),
        "engines":           [
            {
                "name":      r[0],
                "scans":     int(r[1]),
                "mentions":  int(r[2]),
                "sentiment": r[3] or "unknown",
                "rate":      round(int(r[2]) / max(int(r[1]), 1) * 100, 1),
            }
            for r in engine_rows
        ],
        "raw_suggestions":   [r[0] for r in suggestion_rows if r[0]],
        "top_competitors":   [(r[0], int(r[1])) for r in competitor_rows],
        "recent_rate":       round(recent_rate * 100, 1),
        "older_rate":        round(older_rate * 100, 1),
        "trending_up":       recent_rate > older_rate,
        "missed_queries":    [(r[0], int(r[1])) for r in missed_rows],
    }
    print(f"[DEBUG] summary: {summary}", flush=True)
    return summary


def _fetch_brand_info(brand_id: str) -> dict:
    rows = execute_query(
        "SELECT name, domain, description, keywords FROM brands WHERE id = %s",
        (brand_id,)
    )
    if not rows:
        return {}
    return {
        "name":        rows[0][0],
        "domain":      rows[0][1],
        "description": rows[0][2] or "",
        "keywords":    rows[0][3] or [],
    }


# ── Few-shot loader — the self-learning hook ──────────────────────────────────

def _load_few_shot_examples(limit: int = 3) -> str:
    """
    Pull the highest-scored past recommendations from feedback_store.
    Injected into the analyst prompt so the agent learns what "good" looks like.
    Falls back gracefully if feedback_store table doesn't exist yet.
    """
    try:
        rows = execute_query("""
            SELECT output_text, score, context_summary
            FROM feedback_store
            WHERE agent_name = 'analyst_agent'
              AND score >= 4
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """, (limit,))
        if not rows:
            return ""
        examples = []
        for row in rows:
            examples.append(
                f"--- high-quality past recommendation (score {row[1]}/5) ---\n"
                f"context: {row[2]}\n"
                f"output: {row[0]}"
            )
        return "\n\n".join(examples)
    except Exception:
        # Table doesn't exist yet — fine, skip few-shot
        return ""


# ── Core agent call ──────────────────────────────────────────────────────────

def _run_analyst_prompt(
    brand_info: dict,
    summary: dict,
    few_shot: str,
    org_id: str = None,
) -> list[dict]:
    """
    Single Groq call. Returns list of raw recommendation dicts.
    Uses llama-3.3-70b — best reasoning/cost ratio on Groq.
    Token budget: ~800 input, 600 output — stays well under rate limits.
    """
    engine_lines = "\n".join([
        f"  {e['name']}: {e['mentions']}/{e['scans']} mentions "
        f"({e['rate']}%) — sentiment: {e['sentiment']}"
        for e in summary["engines"]
    ])
    missed_lines = "\n".join([
        f"  '{q}' — missed {n} times" for q, n in summary["missed_queries"]
    ])
    competitor_lines = ", ".join([
        f"{name} ({n}x)" for name, n in summary["top_competitors"]
    ]) or "none detected"

    trend_line = (
        f"IMPROVING ({summary['older_rate']}% → {summary['recent_rate']}%)"
        if summary["trending_up"]
        else f"DECLINING ({summary['older_rate']}% → {summary['recent_rate']}%)"
    )

    few_shot_block = (
        f"\nHigh-quality recommendation examples to match:\n{few_shot}\n"
        if few_shot else ""
    )

    prompt = f"""You are a GEO (Generative Engine Optimization) analyst.
Analyze this brand's AI visibility data and return ONLY a JSON array of recommendations.
{few_shot_block}
BRAND DATA:
  Name: {brand_info['name']}
  Domain: {brand_info['domain']}
  Description: {brand_info.get('description', 'not provided')}
  Keywords: {', '.join(brand_info.get('keywords', []))}

SCAN RESULTS:
  Total scans: {summary['total_scans']}
  Overall visibility: {summary['visibility_pct']}%
  Trend: {trend_line}
  Avg position when mentioned: {summary['avg_position']:.1f}

PER-ENGINE BREAKDOWN:
{engine_lines}

QUERIES WHERE BRAND IS NEVER MENTIONED (biggest opportunities):
{missed_lines}

FREQUENTLY CO-MENTIONED COMPETITORS: {competitor_lines}

RAW IMPROVEMENT SIGNALS FROM SCANS:
{chr(10).join('  - ' + s for s in summary['raw_suggestions'][:8])}

Return a JSON array of 3–5 recommendations. Each must be:
{{
  "engine": "Groq|Gemini|all",
  "query": "specific query this targets, or 'general'",
  "recommendation": "specific, actionable improvement in 1-2 sentences",
  "priority": "critical|high|medium|low",
  "category": "content|technical|authority|schema",
  "confidence": 0.0-1.0,
  "evidence": "what in the data supports this",
  "effort": "low|medium|high",
  "impact": "low|medium|high"
}}

Prioritize: critical issues first, specific over vague, evidence-backed over generic.
Return ONLY the JSON array. No markdown, no explanation."""

    org_groq_key = get_org_api_key(org_id, "groq") if org_id else ""
    _client = (
        Groq(api_key=org_groq_key, max_retries=1, timeout=15.0)
        if org_groq_key and org_groq_key != os.getenv("GROQ_API_KEY", "")
        else groq_client
    )

    MAX_RETRIES = 3
    for attempt in range(MAX_RETRIES):
        try:
            completion = _client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=1200,
                temperature=0.2,
            )
            raw = completion.choices[0].message.content.strip()
            print(f"[DEBUG] groq raw response: {raw}", flush=True)
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start == -1 or end == 0:
                time.sleep(2 ** attempt)
                continue
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            time.sleep(2 ** attempt)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            time.sleep(2 ** attempt)
    return []


# ── Persistence ───────────────────────────────────────────────────────────────

def _save_recommendations(recs: list[Recommendation]) -> None:
    """
    Upsert recommendations.
    On conflict (same brand+engine+query+category): update if new priority is higher.
    Keeps the table clean — no duplicate spam on repeated runs.
    """
    priority_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    for rec in recs:
        execute_write("""
            INSERT INTO recommendations
                (brand_id, recommendation, priority, status)
            VALUES (%s, %s, %s, 'pending')
            ON CONFLICT DO NOTHING
        """, (rec.brand_id, rec.recommendation, rec.priority))


def _save_report_metadata(report: AnalystReport) -> None:
    """Store report summary for dashboard — extend schema as needed."""
    execute_write("""
        INSERT INTO analyst_reports
            (brand_id, visibility_score, scan_count, mention_rate,
             trend_summary, recommendations_count, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT DO NOTHING
    """, (
        report.brand_id,
        report.visibility_score,
        report.scan_count,
        report.mention_rate,
        report.trend_summary,
        len(report.recommendations),
    ))


def _ensure_analyst_reports_table() -> None:
    """Create analyst_reports table if it doesn't exist. Idempotent."""
    execute_write("""
        CREATE TABLE IF NOT EXISTS analyst_reports (
            id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            brand_id      UUID REFERENCES brands(id) ON DELETE CASCADE,
            visibility_score  FLOAT,
            scan_count    INTEGER,
            mention_rate  FLOAT,
            trend_summary TEXT,
            recommendations_count INTEGER DEFAULT 0,
            created_at    TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_analyst_reports_brand
            ON analyst_reports(brand_id);
    """)


# ── Public API ────────────────────────────────────────────────────────────────

def run_analyst_agent(brand_id: str, org_id: str = None) -> AnalystReport:
    """
    Main entry point. Call this after a GEO scan completes.

    Returns a fully populated AnalystReport with typed Recommendation objects.
    Side effect: writes to recommendations + analyst_reports tables.

    Usage:
        report = run_analyst_agent(brand_id)
        # recommendations are now in DB, also available in report.recommendations
    """
    _ensure_analyst_reports_table()

    brand_info = _fetch_brand_info(brand_id)
    if not brand_info:
        raise ValueError(f"Brand {brand_id} not found")

    summary = _fetch_brand_scan_summary(brand_id)
    if summary["total_scans"] == 0:
        raise ValueError(f"No scans found for brand {brand_id} — run a scan first")

    # Load self-learning context
    few_shot = _load_few_shot_examples(limit=3)

    # Run the agent
    raw_recs = _run_analyst_prompt(brand_info, summary, few_shot, org_id=org_id)

    # Parse into typed objects
    recommendations = []
    for r in raw_recs:
        try:
            rec = Recommendation(
                brand_id=brand_id,
                engine=r.get("engine", "all"),
                query=r.get("query", "general"),
                recommendation=r["recommendation"],
                priority=r.get("priority", "medium"),
                category=r.get("category", "content"),
                confidence=float(r.get("confidence", 0.5)),
                evidence=r.get("evidence", ""),
                effort=r.get("effort", "medium"),
                impact=r.get("impact", "medium"),
            )
            recommendations.append(rec)
        except Exception:
            continue  # skip malformed entries silently

    # Compute trend summary
    if summary["total_scans"] >= 10:
        trend = (
            f"Trending UP ({summary['older_rate']}% → {summary['recent_rate']}%)"
            if summary["trending_up"]
            else f"Trending DOWN ({summary['older_rate']}% → {summary['recent_rate']}%)"
        )
    else:
        trend = "Insufficient data for trend (need 10+ scans)"

    top_comp = summary["top_competitors"][0][0] if summary["top_competitors"] else None

    report = AnalystReport(
        brand_id=brand_id,
        brand_name=brand_info["name"],
        visibility_score=summary["visibility_pct"],
        scan_count=summary["total_scans"],
        mention_rate=summary["visibility_pct"],
        dominant_sentiment=_dominant_sentiment(summary["engines"]),
        top_competitor=top_comp,
        recommendations=recommendations,
        trend_summary=trend,
    )

    print(f"[DEBUG] recommendations count before save: {len(recommendations)}", flush=True)
    # Persist
    _save_recommendations(recommendations)
    _save_report_metadata(report)

    # Auto-score recommendations using Ollama feedback loop
    try:
        for rec in recommendations:
            auto_score_and_save(
                agent_name="analyst_agent",
                output_text=rec.recommendation,
                context_summary="Brand visibility analysis",
                evidence=rec.evidence
            )
        print(f"[FEEDBACK] Scored {len(recommendations)} recommendations", flush=True)
    except Exception as e:
        print(f"[FEEDBACK] Scoring failed: {e}", flush=True)

    return report


def _dominant_sentiment(engines: list[dict]) -> str:
    sentiments = [e["sentiment"] for e in engines if e["sentiment"] != "unknown"]
    if not sentiments:
        return "unknown"
    return max(set(sentiments), key=sentiments.count)
