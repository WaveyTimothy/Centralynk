"""
marketing_agent.py — Centralynk Marketing Agent

Anthropic pattern: augmented LLM workflow
  environment: scan data + tone profile + competitor landscape
  tools: crawl4ai (scrape), Groq (write), feedback_store (learn)
  system prompt: defines voice, goals, constraints
  loop: research → draft → score → store → improve

Boris principle:
  Every output is typed. Every output is scored.
  Scores ≥ 4 become few-shot examples for the next run.
  The agent gets better every time it runs — no fine-tuning needed.

Karpathy principle:
  No framework. No LangChain. No abstractions.
  Just: data → prompt → output → score → store.
  The entire agent is one file you can read in 10 minutes.

Tone influences (scraped and stored as few-shot examples):
  - James Hawkins (PostHog): brutally honest, developer-first, long-form
  - MikeOSS: ships in public, technical credibility, open source builder
  - Lovable launch: viral, community-led, "built with AI" angle
  - Satya Nadella: thoughtful, vision-driven, enterprise credibility

Human-in-the-loop:
  Every output goes to pending_approvals table.
  Oscar reviews, edits, approves.
  Approved outputs get score=5, become few-shot examples.
  Rejected outputs get score=1, agent learns to avoid them.
"""

import json
import os
import time
from typing import Optional
from pydantic import BaseModel, Field
from groq import Groq
from app.core.database import execute_query, execute_write
from app.services.feedback_store import auto_score_and_save, get_few_shot_examples

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))


# ── Output types ──────────────────────────────────────────────────────────────

class ContentPiece(BaseModel):
    content_type: str           # blog_post | reddit_comment | linkedin_post | video_script
    title: str
    body: str
    target_query: str           # SEO/GEO query this targets
    target_platform: str        # centralynk.com | reddit | linkedin | youtube
    target_subreddit: Optional[str] = None   # e.g. r/SEO, r/ChatGPT
    keywords: list[str] = Field(default_factory=list)
    cta: str = ""               # call to action
    estimated_read_time: int = 0  # minutes
    status: str = "pending"     # pending | approved | rejected | published


class ToneProfile(BaseModel):
    """
    Oscar's personal tone profile.
    Built from examples, updated as the agent learns.
    Boris principle: make the implicit explicit.
    """
    voice: str = "direct and technical but accessible"
    perspective: str = "builder sharing what works, not marketer hyping"
    opener_style: str = "start with the problem or a specific observation, never with 'In today's world'"
    length_preference: str = "long enough to be useful, short enough to be read"
    code_usage: str = "include code when it proves the point"
    self_reference: str = "first person, specific, based on real experience"
    cta_style: str = "soft — share the repo, try the tool, no hard sell"
    avoid: list[str] = Field(default_factory=lambda: [
        "buzzwords like 'revolutionary' or 'game-changer'",
        "passive voice",
        "generic advice that applies to everyone",
        "starting sentences with 'I'",
        "hype without substance",
    ])


# ── Content calendar — what to write and when ────────────────────────────────

CONTENT_CALENDAR = [
    {
        "type": "blog_post",
        "title": "Why I built an open-source GEO tool — and what I learned",
        "target_query": "open source generative engine optimization tool",
        "platform": "centralynk.com",
        "keywords": ["GEO", "generative engine optimization", "open source", "AI visibility"],
        "priority": "critical",
    },
    {
        "type": "blog_post",
        "title": "Otterly vs Centralynk: why I stopped paying $29/mo and built my own",
        "target_query": "Otterly alternative open source GEO",
        "platform": "centralynk.com",
        "keywords": ["Otterly alternative", "GEO tool comparison", "open source GEO"],
        "priority": "high",
    },
    {
        "type": "blog_post",
        "title": "How to track your brand in ChatGPT, Perplexity and Claude (with code)",
        "target_query": "how to track brand visibility in AI search engines",
        "platform": "centralynk.com",
        "keywords": ["AI brand monitoring", "ChatGPT brand tracking", "GEO tutorial"],
        "priority": "high",
    },
    {
        "type": "reddit_comment",
        "title": "Response to 'How do I know if my brand appears in ChatGPT?'",
        "target_query": "brand visibility ChatGPT monitoring",
        "platform": "reddit",
        "subreddit": "r/SEO",
        "keywords": ["GEO", "AI visibility", "brand monitoring"],
        "priority": "high",
    },
    {
        "type": "reddit_comment",
        "title": "Response to 'What tools exist for GEO optimization?'",
        "target_query": "GEO tools generative engine optimization",
        "platform": "reddit",
        "subreddit": "r/ChatGPT",
        "keywords": ["GEO tool", "open source", "self-hosted"],
        "priority": "high",
    },
    {
        "type": "linkedin_post",
        "title": "I built a GEO platform in 2 weeks on a Minisforum mini PC",
        "target_query": "building AI tools side project",
        "platform": "linkedin",
        "keywords": ["GEO", "building in public", "open source", "AI tools"],
        "priority": "medium",
    },
    {
        "type": "linkedin_post",
        "title": "The gap in the GEO market nobody is talking about",
        "target_query": "GEO market open source gap",
        "platform": "linkedin",
        "keywords": ["GEO", "generative engine optimization", "market analysis"],
        "priority": "medium",
    },
    {
        "type": "video_script",
        "title": "Demo: tracking Centralynk's own visibility in AI engines (live)",
        "target_query": "GEO tool demo generative engine optimization",
        "platform": "youtube",
        "keywords": ["GEO demo", "AI visibility tracking", "Centralynk"],
        "priority": "medium",
    },
]


# ── Tone scraper — learns from influencers ────────────────────────────────────

def scrape_tone_examples(urls: list[str]) -> list[str]:
    """
    Scrape content from influencer URLs via crawl4ai.
    Returns list of content snippets to use as tone examples.
    """
    import httpx
    crawl4ai_url = os.getenv("CRAWL4AI_URL", "http://crawl4ai:11235")
    examples = []

    for url in urls:
        try:
            with httpx.Client(timeout=30) as http:
                resp = http.post(
                    f"{crawl4ai_url}/crawl",
                    json={"urls": [url], "priority": 10}
                )
                content = resp.json().get("results", [{}])[0].get("markdown", "")
                if content and len(content) > 200:
                    examples.append(content[:2000])
        except Exception as e:
            print(f"Failed to scrape {url}: {e}")

    return examples


# ── Few-shot loader ───────────────────────────────────────────────────────────

def _load_marketing_examples(content_type: str) -> str:
    """
    Load high-scored past outputs as few-shot examples.
    This is the self-learning hook — the agent reads its best past work.
    """
    rows = get_few_shot_examples("marketing_agent", min_score=4, limit=3)
    if not rows:
        return ""

    # Filter by content type if possible
    relevant = [r for r in rows if content_type in r.get("context", "")]
    examples = relevant or rows[:2]

    return "\n\n".join([
        f"--- Example (score {r['score']}/5) ---\n{r['text']}"
        for r in examples
    ])


# ── Core writer ───────────────────────────────────────────────────────────────

def _write_content(
    content_spec: dict,
    tone: ToneProfile,
    brand_data: dict,
    few_shot: str,
    custom_instructions: str = '',
) -> str:
    """
    Single Groq call that produces the actual content.

    Anthropic pattern: environment + tools + system prompt → output
    The system prompt encodes Oscar's tone. The user prompt provides context.
    """
    content_type = content_spec["type"]
    target_query = content_spec["target_query"]
    keywords = content_spec.get("keywords", [])
    platform = content_spec["platform"]

    # Platform-specific length and style guidance
    style_guide = {
        "blog_post": "1500-2500 words. Use H2 headings. Include code examples where relevant. End with a GitHub link CTA.",
        "reddit_comment": "200-400 words. Conversational, helpful, not promotional. Mention the tool naturally if relevant. No self-promotion spam.",
        "linkedin_post": "150-300 words. Hook in first line. Personal story angle. End with a question or soft CTA.",
        "video_script": "300-500 words. Conversational, as if talking to camera. Include [PAUSE] markers. End with subscribe CTA.",
    }.get(content_type, "500 words. Clear and useful.")

    few_shot_block = f"\nExamples of high-quality content to match in style:\n{few_shot}\n" if few_shot else ""

    prompt = f"""You are writing content for Oscar Castro, founder of Centralynk.

TONE PROFILE:
- Voice: {tone.voice}
- Perspective: {tone.perspective}
- Opener style: {tone.opener_style}
- Length: {tone.length_preference}
- CTA style: {tone.cta_style}
- AVOID: {', '.join(tone.avoid)}

BRAND CONTEXT:
- Product: Centralynk — open-source GEO (Generative Engine Optimization) platform
- What it does: tracks brand visibility in ChatGPT, Perplexity, Claude, Google AI Overview
- Key differentiator: open source, self-hosted, with AI analyst that gives actionable recommendations
- Current visibility score: {brand_data.get('visibility_score', 0)}%
- GitHub: coming soon
- URL: centralynk.com

CONTENT TO WRITE:
- Type: {content_type}
- Title: {content_spec['title']}
- Target SEO/GEO query: "{target_query}"
- Platform: {platform}
- Target keywords to include naturally: {', '.join(keywords)}
- Style guide: {style_guide}
{few_shot_block}
Write the full content now. Start directly with the content — no preamble, no "Here is the content:", just write it.
{f'Additional instructions: {custom_instructions}' if custom_instructions else ''}"""

    MAX_RETRIES = 3
    for attempt in range(MAX_RETRIES):
        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2000,
                temperature=0.7,  # slightly higher for creative content
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                return f"Error generating content: {e}"
            time.sleep(2 ** attempt)

    return ""


# ── Pending approvals — human in the loop ────────────────────────────────────

def _ensure_approvals_table() -> None:
    execute_write("""
        CREATE TABLE IF NOT EXISTS pending_approvals (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            content_type VARCHAR(50) NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            target_query TEXT,
            target_platform VARCHAR(100),
            target_subreddit VARCHAR(100),
            keywords JSONB DEFAULT '[]'::jsonb,
            cta TEXT DEFAULT '',
            status VARCHAR(50) DEFAULT 'pending',
            feedback_id TEXT,
            score SMALLINT,
            editor_notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            reviewed_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_approvals_status
            ON pending_approvals(status);
        CREATE INDEX IF NOT EXISTS idx_approvals_type
            ON pending_approvals(content_type);
    """)


def _save_for_approval(piece: ContentPiece, feedback_id: str) -> str:
    """Save content to pending_approvals for Oscar to review."""
    rows = execute_query("""
        INSERT INTO pending_approvals
            (content_type, title, body, target_query, target_platform,
             target_subreddit, keywords, cta, feedback_id)
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
        RETURNING id::text
    """, (
        piece.content_type,
        piece.title,
        piece.body,
        piece.target_query,
        piece.target_platform,
        piece.target_subreddit,
        json.dumps(piece.keywords),
        piece.cta,
        feedback_id,
    ))
    return rows[0][0] if rows else ""


# ── Public API ────────────────────────────────────────────────────────────────

def run_marketing_agent(
    content_type: str = "blog_post",
    custom_spec: Optional[dict] = None,
    brand_id: str = "3132a21d-7ea3-4f02-a380-f509007f1450",
) -> dict:
    """
    Main entry point. Call this to generate a piece of marketing content.

    Flow (Anthropic workflow pattern):
    1. Load brand data (environment)
    2. Load tone examples + few-shot (memory)
    3. Select content spec from calendar
    4. Write content (LLM call)
    5. Auto-score output
    6. Save to pending_approvals for Oscar to review
    7. Return result

    Human-in-the-loop: Oscar reviews in /admin, approves or rejects.
    Approved → score=5 → becomes few-shot for next run.
    Rejected → score=1 → agent avoids this style next time.
    """
    _ensure_approvals_table()

    # Step 1: load brand data
    brand_rows = execute_query(
        "SELECT name, domain, description, keywords FROM brands WHERE id = %s",
        (brand_id,)
    )
    if not brand_rows:
        return {"error": "Brand not found"}

    brand_data = {
        "name":        brand_rows[0][0],
        "domain":      brand_rows[0][1],
        "description": brand_rows[0][2],
        "keywords":    brand_rows[0][3],
    }

    # Get latest visibility score
    vis_rows = execute_query("""
        SELECT ROUND(100.0 * SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)
               / NULLIF(COUNT(*), 0), 1)
        FROM engine_scans WHERE brand_id = %s
    """, (brand_id,))
    brand_data["visibility_score"] = float(vis_rows[0][0] or 0) if vis_rows else 0

    # Step 2: select content spec
    spec = custom_spec
    if not spec:
        # Pick next unwritten item from calendar
        written = execute_query(
            "SELECT title FROM pending_approvals WHERE content_type = %s",
            (content_type,)
        )
        written_titles = {r[0] for r in written}
        candidates = [
            s for s in CONTENT_CALENDAR
            if s["type"] == content_type and s["title"] not in written_titles
        ]
        if not candidates:
            # All written — start over with highest priority
            candidates = [s for s in CONTENT_CALENDAR if s["type"] == content_type]
        spec = candidates[0] if candidates else CONTENT_CALENDAR[0]

    # Step 3: load few-shot examples (self-learning)
    few_shot = _load_marketing_examples(content_type)

    # Step 4: write content
    # Load tone profile for this workspace (Boris: tone is data)
    workspace_id = custom_spec.get("workspace_id", "centralynk") if custom_spec else "centralynk"
    tone, custom_instructions = load_tone_profile(workspace_id)
    body = _write_content(spec, tone, brand_data, few_shot, custom_instructions=custom_instructions)

    if not body or body.startswith("Error"):
        return {"error": body}

    # Step 5: auto-score
    score, feedback_id = auto_score_and_save(
        agent_name="marketing_agent",
        output_text=body[:500],  # score on first 500 chars
        context_summary=f"{content_type} — {spec['title']}",
        evidence=f"targeting query: {spec['target_query']}",
    )

    # Step 6: save for approval
    piece = ContentPiece(
        content_type=content_type,
        title=spec["title"],
        body=body,
        target_query=spec["target_query"],
        target_platform=spec["platform"],
        target_subreddit=spec.get("subreddit"),
        keywords=spec.get("keywords", []),
        cta=f"Check out Centralynk at centralynk.com or star the repo on GitHub.",
    )
    approval_id = _save_for_approval(piece, feedback_id)

    return {
        "status":       "pending_approval",
        "approval_id":  approval_id,
        "content_type": content_type,
        "title":        spec["title"],
        "auto_score":   score,
        "preview":      body[:300] + "...",
        "feedback_id":  feedback_id,
        "message":      "Content saved. Review and approve at app.centralynk.com/admin",
    }


def get_pending_content(content_type: Optional[str] = None) -> list[dict]:
    """Return all pending content pieces for Oscar to review."""
    _ensure_approvals_table()
    query = """
        SELECT id::text, content_type, title, body, target_query,
               target_platform, target_subreddit, keywords,
               score, status, editor_notes, created_at
        FROM pending_approvals
        WHERE status = 'pending'
    """
    params = ()
    if content_type:
        query += " AND content_type = %s"
        params = (content_type,)
    query += " ORDER BY created_at DESC"

    rows = execute_query(query, params)
    return [
        {
            "id":           r[0],
            "type":         r[1],
            "title":        r[2],
            "body":         r[3],
            "query":        r[4],
            "platform":     r[5],
            "subreddit":    r[6],
            "keywords":     r[7],
            "score":        r[8],
            "status":       r[9],
            "notes":        r[10],
            "created_at":   str(r[11]),
        }
        for r in rows
    ]


def approve_content(approval_id: str, editor_notes: str = "") -> dict:
    """
    Oscar approves a content piece.
    Side effect: updates feedback score to 5 — feeds self-learning loop.
    """
    from app.services.feedback_store import update_score

    rows = execute_query(
        "SELECT feedback_id FROM pending_approvals WHERE id = %s",
        (approval_id,)
    )
    if rows and rows[0][0]:
        update_score(rows[0][0], 5, notes=f"Human approved. {editor_notes}")

    execute_write("""
        UPDATE pending_approvals
        SET status = 'approved', editor_notes = %s, reviewed_at = NOW()
        WHERE id = %s
    """, (editor_notes, approval_id))

    return {"status": "approved", "id": approval_id}


def reject_content(approval_id: str, reason: str = "") -> dict:
    """
    Oscar rejects a content piece.
    Side effect: updates feedback score to 1 — agent avoids this style.
    """
    from app.services.feedback_store import update_score

    rows = execute_query(
        "SELECT feedback_id FROM pending_approvals WHERE id = %s",
        (approval_id,)
    )
    if rows and rows[0][0]:
        update_score(rows[0][0], 1, notes=f"Human rejected. Reason: {reason}")

    execute_write("""
        UPDATE pending_approvals
        SET status = 'rejected', editor_notes = %s, reviewed_at = NOW()
        WHERE id = %s
    """, (reason, approval_id))

    return {"status": "rejected", "id": approval_id}


def load_tone_profile(workspace_id: str):
    """Load tone profile from DB. Falls back to defaults if not found."""
    try:
        rows = execute_query("""
            SELECT voice, perspective, opener_style, custom_instructions
            FROM tone_profiles WHERE workspace_id = %s
        """, (workspace_id,))
        if rows:
            r = rows[0]
            return ToneProfile(
                voice=r[0] or "direct, technical, honest",
                perspective=r[1] or "builder sharing what works",
                opener_style=r[2] or "start with the problem",
            ), r[3] or ""
    except Exception:
        pass
    return ToneProfile(), ""
