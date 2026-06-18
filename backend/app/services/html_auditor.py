"""
html_auditor.py — Semantic HTML Auditor

Crawls a URL via crawl4ai and scores it for AI readability.
Based on the 6 GEO technical strategies:

1. Schema JSON-LD present
2. Semantic HTML tags used (article, section, header, nav, main)
3. Open Graph / meta tags present
4. Content not JS-gated (crawlable)
5. Atomic content blocks (FAQ, lists, tables)
6. Heading hierarchy (h1 → h2 → h3)

Boris principle: score is data. Every issue has a specific fix.
"""

import httpx
import os
import re
from groq import Groq

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))


def crawl_url(url: str) -> dict:
    """Crawl URL via crawl4ai and return raw content."""
    crawl4ai_url = os.getenv("CRAWL4AI_URL", "http://crawl4ai:11235")
    try:
        with httpx.Client(timeout=60) as http:
            resp = http.post(
                f"{crawl4ai_url}/crawl",
                json={"urls": [url], "priority": 10}
            )
            result = resp.json().get("results", [{}])[0]
            markdown_data = result.get("markdown", {})
            if isinstance(markdown_data, dict):
                markdown_text = markdown_data.get("raw_markdown", "")
            else:
                markdown_text = markdown_data or ""
            return {
                "html": result.get("html", ""),
                "markdown": markdown_text,
                "success": bool(markdown_text),
                "error": result.get("error_message", ""),
            }
    except Exception as e:
        return {"html": "", "markdown": "", "success": False, "error": str(e)}


def audit_html(url: str) -> dict:
    """
    Full semantic HTML audit for AI readability.
    Returns score 0-100 with specific fixes.
    """
    crawl_result = crawl_url(url)

    if not crawl_result["success"]:
        return {
            "url": url,
            "score": 0,
            "error": f"Could not crawl URL: {crawl_result['error']}",
            "checks": [],
            "fixes": [],
        }

    html = crawl_result["html"]
    markdown = crawl_result["markdown"]

    checks = []

    # 1. Schema JSON-LD
    has_schema = "application/ld+json" in html or "schema.org" in html
    checks.append({
        "id": "schema_json_ld",
        "name": "Schema.org JSON-LD",
        "passed": has_schema,
        "weight": 20,
        "description": "Structured data markup that makes your content machine-readable",
        "fix": 'Add <script type="application/ld+json"> with Organization and FAQPage schema to your <head>',
        "priority": "critical" if not has_schema else "ok",
    })

    # 2. Semantic HTML tags
    semantic_tags = ["<article", "<section", "<header", "<nav", "<main", "<aside", "<footer"]
    semantic_count = sum(1 for tag in semantic_tags if tag in html)
    has_semantic = semantic_count >= 3
    checks.append({
        "id": "semantic_html",
        "name": "Semantic HTML Tags",
        "passed": has_semantic,
        "weight": 15,
        "score_detail": f"{semantic_count}/{len(semantic_tags)} semantic tags found",
        "description": "Tags like <article>, <section>, <main> help AI understand page structure",
        "fix": "Replace <div> containers with semantic tags: <main>, <article>, <section>, <header>",
        "priority": "high" if not has_semantic else "ok",
    })

    # 3. Open Graph tags
    og_tags = ["og:title", "og:description", "og:url", "og:image"]
    og_count = sum(1 for tag in og_tags if tag in html)
    has_og = og_count >= 3
    checks.append({
        "id": "open_graph",
        "name": "Open Graph Meta Tags",
        "passed": has_og,
        "weight": 15,
        "score_detail": f"{og_count}/{len(og_tags)} OG tags found",
        "description": "OG tags help AI understand page intent and generate previews",
        "fix": 'Add to <head>: <meta property="og:title">, <meta property="og:description">, <meta property="og:url">',
        "priority": "high" if not has_og else "ok",
    })

    # 4. Content not JS-gated
    content_length = len(markdown.strip())
    has_content = content_length > 500
    checks.append({
        "id": "crawlable_content",
        "name": "Crawlable Content",
        "passed": has_content,
        "weight": 20,
        "score_detail": f"{content_length} characters extracted",
        "description": "AI crawlers can't read content locked behind JavaScript",
        "fix": "Move critical content to server-side rendered HTML. Avoid hiding text in JS components.",
        "priority": "critical" if not has_content else "ok",
    })

    # 5. Heading hierarchy
    h1_count = len(re.findall(r'<h1[^>]*>', html, re.IGNORECASE))
    h2_count = len(re.findall(r'<h2[^>]*>', html, re.IGNORECASE))
    has_hierarchy = h1_count == 1 and h2_count >= 2
    checks.append({
        "id": "heading_hierarchy",
        "name": "Heading Hierarchy",
        "passed": has_hierarchy,
        "weight": 10,
        "score_detail": f"H1: {h1_count}, H2: {h2_count}",
        "description": "Clear heading structure helps AI parse content sections",
        "fix": "Use exactly one <h1> per page. Use <h2> for sections, <h3> for subsections.",
        "priority": "medium" if not has_hierarchy else "ok",
    })

    # 6. Atomic content blocks
    has_lists = "<ul" in html or "<ol" in html
    has_tables = "<table" in html
    has_faq = "faq" in html.lower() or "frequently asked" in html.lower()
    atomic_count = sum([has_lists, has_tables, has_faq])
    has_atomic = atomic_count >= 1
    checks.append({
        "id": "atomic_content",
        "name": "Atomic Content Blocks",
        "passed": has_atomic,
        "weight": 10,
        "score_detail": f"Lists: {'✓' if has_lists else '✗'}, Tables: {'✓' if has_tables else '✗'}, FAQ: {'✓' if has_faq else '✗'}",
        "description": "AI prefers chunked content: bullet lists, tables, FAQ sections",
        "fix": "Break long paragraphs into bullet lists. Add an FAQ section. Use tables for comparisons.",
        "priority": "medium" if not has_atomic else "ok",
    })

    # 7. llms.txt present
    llms_url = url.rstrip("/").split("//")[-1].split("/")[0]
    has_llms = False
    try:
        with httpx.Client(timeout=5) as http:
            r = http.get(f"https://{llms_url}/llms.txt")
            has_llms = r.status_code == 200
    except Exception:
        pass

    checks.append({
        "id": "llms_txt",
        "name": "llms.txt File",
        "passed": has_llms,
        "weight": 10,
        "description": "Tells AI crawlers how to cite and index your brand",
        "fix": f"Create /llms.txt at https://{llms_url}/llms.txt — use Centralynk's generator",
        "priority": "high" if not has_llms else "ok",
    })

    # Calculate score
    total_weight = sum(c["weight"] for c in checks)
    earned_weight = sum(c["weight"] for c in checks if c["passed"])
    score = round(earned_weight / total_weight * 100)

    # Get AI-powered summary
    failed_checks = [c for c in checks if not c["passed"]]
    fixes = [c["fix"] for c in failed_checks]

    ai_summary = _get_ai_summary(url, score, failed_checks, markdown[:1000])

    return {
        "url": url,
        "score": score,
        "grade": "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F",
        "summary": ai_summary,
        "checks": checks,
        "fixes": fixes,
        "stats": {
            "content_length": content_length,
            "h1_count": h1_count,
            "h2_count": h2_count,
            "semantic_tags_found": semantic_count,
            "og_tags_found": og_count,
        }
    }


def _get_ai_summary(url: str, score: int, failed_checks: list, content_preview: str) -> str:
    """Generate a specific, actionable AI summary of audit findings."""
    if not failed_checks:
        return f"Excellent GEO readiness! {url} is well-optimized for AI crawlers."

    failed_names = [c["name"] for c in failed_checks]
    prompt = f"""You are a GEO (Generative Engine Optimization) expert.

URL audited: {url}
GEO readiness score: {score}/100
Failed checks: {', '.join(failed_names)}
Content preview: {content_preview[:300]}

Write a 2-3 sentence specific summary of what's wrong and the single most important fix.
Be specific to this URL. No generic advice. No bullet points. Just prose."""

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
            temperature=0.3,
        )
        return completion.choices[0].message.content.strip()
    except Exception:
        return f"Score: {score}/100. Main issues: {', '.join(failed_names[:3])}."
