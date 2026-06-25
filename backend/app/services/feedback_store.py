"""
feedback_store.py — Self-learning feedback loop

Every agent output gets a score (1-5).
Score >= 4 outputs become few-shot examples for future runs.
Score <= 2 outputs get flagged so we know what to avoid.
No fine-tuning. No external service. Just Postgres + a SELECT.
"""

import os
from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator
from groq import Groq
from app.core.database import execute_query, execute_write

# Single source of truth — no duplicate declarations
FEEDBACK_LOOP_PROVIDER = os.getenv("FEEDBACK_LOOP_PROVIDER", "groq")
FEEDBACK_LOOP_MODEL = os.getenv("FEEDBACK_LOOP_MODEL", "llama-3.3-70b-versatile")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")

groq_client = Groq(
    api_key=os.getenv("GROQ_API_KEY", ""),
    max_retries=1,
    timeout=10.0,
)

AgentName = Literal["analyst_agent", "marketing_agent", "sales_agent", "geo_engine"]
Score = int  # 1-5


# ── Schema ────────────────────────────────────────────────────────────────────

class FeedbackEntry(BaseModel):
    agent_name: AgentName
    output_text: str
    score: Score
    context_summary: str = ""
    scorer: Literal["human", "auto"] = "auto"
    notes: str = ""

    @field_validator("score")
    @classmethod
    def score_in_range(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("score must be 1-5")
        return v


class FeedbackStats(BaseModel):
    agent_name: str
    total_entries: int
    avg_score: float
    high_quality_count: int
    low_quality_count: int
    auto_scored: int
    human_scored: int


# ── Table setup ───────────────────────────────────────────────────────────────

def ensure_feedback_table() -> None:
    execute_write("""
        CREATE TABLE IF NOT EXISTS feedback_store (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            agent_name      VARCHAR(50) NOT NULL,
            output_text     TEXT NOT NULL,
            score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
            context_summary TEXT DEFAULT '',
            scorer          VARCHAR(20) DEFAULT 'auto',
            notes           TEXT DEFAULT '',
            org_id          UUID,
            workspace_id    UUID,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_feedback_agent_score
            ON feedback_store(agent_name, score DESC);

        CREATE INDEX IF NOT EXISTS idx_feedback_agent_created
            ON feedback_store(agent_name, created_at DESC);
    """)


# ── Write ─────────────────────────────────────────────────────────────────────

def save_feedback(entry: FeedbackEntry, org_id: str = None, workspace_id: str = None) -> str:
    ensure_feedback_table()
    rows = execute_query("""
        INSERT INTO feedback_store
            (agent_name, output_text, score, context_summary, scorer, notes, org_id, workspace_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id::text
    """, (
        entry.agent_name,
        entry.output_text,
        entry.score,
        entry.context_summary,
        entry.scorer,
        entry.notes,
        org_id,
        workspace_id,
    ))
    return rows[0][0] if rows else ""


def update_score(feedback_id: str, new_score: Score, notes: str = "") -> None:
    if not 1 <= new_score <= 5:
        raise ValueError("score must be 1-5")
    execute_write("""
        UPDATE feedback_store
        SET score = %s, scorer = 'human', notes = %s
        WHERE id = %s
    """, (new_score, notes, feedback_id))


# ── Auto-scorer ───────────────────────────────────────────────────────────────

def auto_score_recommendation(
    recommendation_text: str,
    brand_context: str,
    evidence: str = "",
) -> Score:
    """
    Use Groq to score a recommendation 1-5.
    Hard limits: max_retries=1, timeout=10s — never blocks workers.
    Falls back to neutral score 3 on any failure.
    """
    prompt = f"""Score this GEO recommendation 1-5.

Brand context: {brand_context[:300]}
Evidence from scans: {evidence[:200]}
Recommendation: {recommendation_text}

Scoring rubric:
5 = specific + evidence-backed + actionable today + high expected impact
4 = specific + mostly backed by data + clear action
3 = reasonable but generic
2 = vague or ignores the data
1 = wrong or off-topic

Return ONLY a single integer (1, 2, 3, 4, or 5). Nothing else."""

    try:
        completion = groq_client.chat.completions.create(
            model=FEEDBACK_LOOP_MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=5,
            temperature=0.0,
        )
        raw = completion.choices[0].message.content.strip()
        score = int(raw[0])
        return max(1, min(5, score))
    except Exception as e:
        print(f"Auto-score failed (neutral fallback): {e}")
        return 3


def auto_score_and_save(
    agent_name: AgentName,
    output_text: str,
    context_summary: str = "",
    evidence: str = "",
) -> tuple[Score, str]:
    score = auto_score_recommendation(output_text, context_summary, evidence)
    entry = FeedbackEntry(
        agent_name=agent_name,
        output_text=output_text,
        score=score,
        context_summary=context_summary,
        scorer="auto",
    )
    fid = save_feedback(entry)
    return score, fid


# ── Read — few-shot pool ──────────────────────────────────────────────────────

def get_few_shot_examples(
    agent_name: AgentName,
    min_score: Score = 4,
    limit: int = 5,
    org_id: str = None,
    workspace_id: str = None,
) -> list[dict]:
    ensure_feedback_table()

    if agent_name == "analyst_agent":
        rows = execute_query("""
            SELECT output_text, score, context_summary, created_at
            FROM feedback_store
            WHERE agent_name = %s AND score >= %s
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """, (agent_name, min_score, limit))

    elif agent_name == "marketing_agent" and workspace_id:
        rows = execute_query("""
            SELECT output_text, score, context_summary, created_at
            FROM feedback_store
            WHERE agent_name = %s AND score >= %s AND workspace_id = %s
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """, (agent_name, min_score, workspace_id, limit))

    elif org_id:
        rows = execute_query("""
            SELECT output_text, score, context_summary, created_at
            FROM feedback_store
            WHERE agent_name = %s AND score >= %s AND org_id = %s
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """, (agent_name, min_score, org_id, limit))

    else:
        rows = execute_query("""
            SELECT output_text, score, context_summary, created_at
            FROM feedback_store
            WHERE agent_name = %s AND score >= %s
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """, (agent_name, min_score, limit))

    return [
        {"text": r[0], "score": r[1], "context": r[2], "date": str(r[3])}
        for r in rows
    ]


def get_negative_examples(
    agent_name: AgentName,
    max_score: Score = 2,
    limit: int = 3,
) -> list[dict]:
    ensure_feedback_table()
    rows = execute_query("""
        SELECT output_text, score, context_summary
        FROM feedback_store
        WHERE agent_name = %s AND score <= %s
        ORDER BY score ASC, created_at DESC
        LIMIT %s
    """, (agent_name, max_score, limit))
    return [{"text": r[0], "score": r[1], "context": r[2]} for r in rows]


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_feedback_stats(agent_name: AgentName) -> FeedbackStats:
    ensure_feedback_table()
    rows = execute_query("""
        SELECT
            COUNT(*),
            AVG(score),
            SUM(CASE WHEN score >= 4 THEN 1 ELSE 0 END),
            SUM(CASE WHEN score <= 2 THEN 1 ELSE 0 END),
            SUM(CASE WHEN scorer = 'auto' THEN 1 ELSE 0 END),
            SUM(CASE WHEN scorer = 'human' THEN 1 ELSE 0 END)
        FROM feedback_store
        WHERE agent_name = %s
    """, (agent_name,))
    r = rows[0] if rows else (0, 0, 0, 0, 0, 0)
    return FeedbackStats(
        agent_name=agent_name,
        total_entries=int(r[0] or 0),
        avg_score=round(float(r[1] or 0), 2),
        high_quality_count=int(r[2] or 0),
        low_quality_count=int(r[3] or 0),
        auto_scored=int(r[4] or 0),
        human_scored=int(r[5] or 0),
    )


def get_pending_human_review(
    agent_name: AgentName,
    limit: int = 20,
) -> list[dict]:
    ensure_feedback_table()
    rows = execute_query("""
        SELECT id::text, output_text, score, context_summary, created_at
        FROM feedback_store
        WHERE agent_name = %s AND score = 3 AND scorer = 'auto'
        ORDER BY created_at DESC
        LIMIT %s
    """, (agent_name, limit))
    return [
        {"id": r[0], "text": r[1], "score": r[2], "context": r[3], "date": str(r[4])}
        for r in rows
    ]
