"""
geo_engine.py — GEO scan engine

Engines:
  - Gemini: real API call (google-generativeai)
  - Groq: real API call, used as itself (not simulating others)

Premium engines (ChatGPT, Perplexity, Claude) — not yet implemented.
These will be added as paid features.

Boris principle: no simulation. Real data only. If we can't measure it
honestly, we don't show it.
"""

import httpx
import json
import os
import time
from groq import Groq
from app.core.database import execute_write, execute_query

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", ""), max_retries=0, timeout=10.0)

def get_org_api_key(org_id: str, provider: str) -> str:
    """
    BYOK: Return org's own API key for this provider.
    Never falls back to system key — pure BYOK.
    Returns empty string if no key configured.
    """
    if not org_id:
        return ""
    try:
        from app.core.database import execute_query as eq
        from app.core.crypto import decrypt_key
        rows = eq(
            "SELECT api_keys->%s FROM organisations WHERE id = %s",
            (provider, org_id)
        )
        if rows and rows[0][0]:
            return decrypt_key(rows[0][0])
    except Exception:
        pass
    return ""



# Only real engines for now
GEO_ENGINES = []  # No default engines — all require BYOK


def scrape_url(url: str) -> str:
    """Scrape brand content via Crawl4AI."""
    crawl4ai_url = os.getenv("CRAWL4AI_URL", "http://crawl4ai:11235")
    try:
        with httpx.Client(timeout=30) as http:
            resp = http.post(
                f"{crawl4ai_url}/crawl",
                json={"urls": [url], "priority": 10}
            )
            content = resp.json().get("results", [{}])[0].get("markdown", "")
            return content[:3000]
    except Exception as e:
        return f"scrape failed: {e}"


def get_embedding(text: str) -> list:
    """Get embedding from local Ollama nomic-embed-text."""
    ollama_url = os.getenv("OLLAMA_URL", "http://ollama:11434")
    try:
        with httpx.Client(timeout=30) as http:
            resp = http.post(
                f"{ollama_url}/api/embeddings",
                json={"model": "nomic-embed-text", "prompt": text[:1000]}
            )
            return resp.json().get("embedding", [])
    except Exception:
        return []


def query_groq_real(query: str, brand_name: str, brand_context: str = "", client=None, api_key: str = "") -> dict:
    """
    Real Groq query using httpx directly — bypasses SDK timeout issues.
    """
    import httpx as _httpx
    
    # Get API key — NEVER fall back to system key, BYOK only
    _api_key = api_key
    if not _api_key and client:
        try:
            _api_key = client.api_key
        except Exception:
            pass
    
    default_error = {
        "engine": "Groq",
        "brand_mentioned": False,
        "position": 0,
        "sentiment": "error",
        "competitors": [],
        "suggestion": "",
        "response": "",
        "real": True,
    }
    
    if not _api_key:
        return default_error
    
    headers = {
        "Authorization": f"Bearer {_api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        # Step 1: Get Groq response
        r1 = _httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": query}],
                "max_tokens": 512,
                "temperature": 0.3,
            },
            timeout=10.0
        )
        if r1.status_code != 200:
            err = r1.json().get("error", {})
            msg = err.get("message", f"HTTP {r1.status_code}")
            result = default_error.copy()
            result["suggestion"] = f"Error: {msg[:100]}"
            return result
            
        raw_response = r1.json()["choices"][0]["message"]["content"].strip()

        # Step 2: Analyze for brand visibility (local — no extra API call)
        return _analyze_response(raw_response, brand_name, "Groq", query)
        
    except Exception as e:
        result = default_error.copy()
        result["suggestion"] = f"Error: {str(e)[:100]}"
        return result

    return {
        "engine": "Groq",
        "brand_mentioned": False,
        "sentiment": "error",
        "real": True,
    }


def query_gemini_real(query: str, brand_name: str, api_key: str = "") -> dict:
    """
    Real Gemini query via httpx — bypasses SDK timeout issues.
    """
    import httpx as _httpx
    _api_key = api_key
    if not _api_key:
        return {"engine": "Gemini", "brand_mentioned": False, "sentiment": "error", "competitors": [], "suggestion": "", "response": "", "real": True}
    try:
        r = _httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={_api_key}",
            json={"contents": [{"parts": [{"text": query}]}], "generationConfig": {"maxOutputTokens": 512, "temperature": 0.3}},
            timeout=10.0
        )
        if r.status_code != 200:
            err = r.json().get("error", {}).get("message", f"HTTP {r.status_code}")
            return {"engine": "Gemini", "brand_mentioned": False, "sentiment": "error", "competitors": [], "suggestion": f"Error: {err[:100]}", "response": "", "real": True}
        raw_response = r.json()["candidates"][0]["content"]["parts"][0]["text"]

        # Step 2: Analyze for brand visibility (local — no extra API call)
        return _analyze_response(raw_response, brand_name, "Gemini", query)

    except Exception as e:
        return {
            "engine": "Gemini",
            "brand_mentioned": False,
            "position": 0,
            "sentiment": "error",
            "competitors": [],
            "suggestion": f"Error: {str(e)}",
            "response": "",
            "real": True,
        }

    return {
        "engine": "Gemini",
        "brand_mentioned": False,
        "sentiment": "error",
        "real": True,
    }


def get_previous_scan(brand_id: str, engine: str, query: str) -> dict | None:
    """Fetch previous scan for trend diffing."""
    rows = execute_query("""
        SELECT brand_mentioned, sentiment, position, scanned_at
        FROM engine_scans
        WHERE brand_id = %s AND engine_name = %s AND query = %s
        ORDER BY scanned_at DESC
        LIMIT 1
    """, (brand_id, engine, query))
    if not rows:
        return None
    return {
        "brand_mentioned": rows[0][0],
        "sentiment": rows[0][1],
        "position": rows[0][2],
    }




def extract_cited_sources(response_text: str) -> list[str]:
    """
    Extract URLs and domain sources cited in an AI response.
    AI engines often mention specific websites as sources.
    E.g. "According to centralynk.com..." or "Source: otterly.ai"
    """
    import re
    sources = []
    
    # Extract explicit URLs
    url_pattern = r'https?://(?:www\.)?([a-zA-Z0-9\-]+\.[a-zA-Z]{2,})'
    urls = re.findall(url_pattern, response_text)
    sources.extend(urls)
    
    # Extract domain mentions (domain.com patterns)
    domain_pattern = r'(?<![/@])([a-zA-Z0-9\-]+\.(?:com|io|ai|co|org|net|app))'
    domains = re.findall(domain_pattern, response_text)
    sources.extend(domains)
    
    # Deduplicate and clean
    seen = set()
    clean = []
    for s in sources:
        s = s.lower().strip('.,!?')
        if s and s not in seen and len(s) > 4:
            seen.add(s)
            clean.append(s)
    
    return clean[:10]  # max 10 sources per response

def _friendly_error(raw: str) -> str:
    """Convert a raw exception string into a short human-readable message."""
    r = raw.lower()
    if "429" in r or "quota" in r or "rate" in r:
        return "quota exceeded — resets tomorrow"
    if "401" in r or "403" in r or "invalid api key" in r or "authentication" in r:
        return "invalid API key — check Settings"
    if "timeout" in r or "timed out" in r:
        return "request timed out — try again"
    if "connection" in r or "network" in r:
        return "network error — try again"
    return raw[:120]


def run_geo_scan(brand_id: str, queries: list, org_id: str = None) -> dict:
    """
    Main GEO scan — Groq + Gemini only. Real data, no simulation.

    For each query:
    1. Query Groq as itself
    2. Query Gemini as itself
    3. Analyze brand visibility in each response
    4. Store results with embeddings
    5. Return summary with trend diff
    """
    rows = execute_query(
        "SELECT id, name, domain, keywords FROM brands WHERE id = %s",
        (brand_id,)
    )
    if not rows:
        return {"error": "Brand not found"}

    _, brand_name, domain, keywords = rows[0]

    # Scrape brand context to help engines understand what the brand does
    brand_context = scrape_url(f"https://{domain}")
    if not brand_context or "scrape failed" in brand_context:
        # Fallback to description from DB
        desc_rows = execute_query("SELECT description FROM brands WHERE id = %s", (brand_id,))
        brand_context = desc_rows[0][0] if desc_rows and desc_rows[0][0] else ""

    # Build dynamic engine list based on org's available API keys
    active_engines = []  # No default engines — all require BYOK
    if org_id:
        groq_key = get_org_api_key(org_id, "groq")
        anthropic_key = get_org_api_key(org_id, "anthropic")
        openai_key = get_org_api_key(org_id, "openai")
        perplexity_key = get_org_api_key(org_id, "perplexity")
        gemini_key = get_org_api_key(org_id, "gemini")
        if groq_key:
            active_engines.append("Groq")
        if anthropic_key:
            active_engines.append("Claude")
        if openai_key:
            active_engines.append("ChatGPT")
        if perplexity_key:
            active_engines.append("Perplexity")
        if gemini_key:
            active_engines.append("Gemini")
    # No engines configured — user needs to add API keys
    if not active_engines:
        return {
            "brand": brand_name,
            "domain": domain,
            "visibility_score": None,
            "total_scans": 0,
            "times_mentioned": 0,
            "engines_used": [],
            "real_data": False,
            "status": "no_engines",
            "message": "No API keys configured. Add your API keys in Settings to start scanning.",
            "setup_url": "/settings"
        }

    total_scans = 0
    total_mentioned = 0
    all_competitors = []
    all_suggestions = []
    newly_mentioned = []
    lost_mentions = []
    successful_engines = []
    engine_errors: dict = {}

    # Build org Groq client once — reused across all queries
    import groq as groq_lib
    org_groq_client = groq_lib.Groq(api_key=groq_key, max_retries=0, timeout=10.0) if groq_key else None

    for query in queries:
        for engine in active_engines:

            # Get previous scan for trend diff
            previous = get_previous_scan(brand_id, engine, query)

            # Real engine call
            if engine == "Claude":
                result = query_anthropic_real(query, brand_name, brand_context, anthropic_key)
            elif engine == "ChatGPT":
                result = query_openai_real(query, brand_name, brand_context, openai_key)
            elif engine == "Perplexity":
                result = query_perplexity_real(query, brand_name, brand_context, perplexity_key)
            elif engine == "Gemini":
                result = query_gemini_real(query, brand_name, gemini_key)
            else:  # Groq
                result = query_groq_real(query, brand_name, client=org_groq_client, api_key=groq_key)

            # Skip errored engine responses — capture friendly message for frontend
            if result.get("sentiment") == "error" or result.get("error"):
                if engine not in engine_errors:
                    # query_groq_real / query_gemini_real put the raw error in "suggestion";
                    # query_anthropic/openai/perplexity put it in "error"
                    raw_err = result.get("error") or result.get("suggestion", "unknown error")
                    engine_errors[engine] = _friendly_error(str(raw_err))
                continue

            if engine not in successful_engines:
                successful_engines.append(engine)

            # Trend diff
            if previous:
                if result.get("brand_mentioned") and not previous["brand_mentioned"]:
                    newly_mentioned.append(f"{engine} for '{query}'")
                elif not result.get("brand_mentioned") and previous["brand_mentioned"]:
                    lost_mentions.append(f"{engine} for '{query}'")

            # Extract citation sources from response
            cited = extract_cited_sources(result.get("response", ""))

            # Get embedding
            embedding = get_embedding(result.get("response", query))

            # Save to DB
            execute_write("""
                INSERT INTO engine_scans
                (brand_id, engine_name, query, response, brand_mentioned,
                 sentiment, position, embedding, lessons_learned, cited_sources)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::vector, %s::jsonb, %s)
            """, (
                brand_id,
                engine,
                query,
                result.get("response", ""),
                result.get("brand_mentioned", False),
                result.get("sentiment", "not_mentioned"),
                result.get("position", 0),
                embedding or None,
                json.dumps({
                    "suggestion":  result.get("suggestion", ""),
                    "competitors": result.get("competitors", []),
                    "real":        result.get("real", True),
                    "error":       result.get("error"),
                }),
                cited or []
            ))

            if result.get("brand_mentioned"):
                total_mentioned += 1
            all_competitors.extend(result.get("competitors", []))
            suggestion = result.get("suggestion", "")
            if suggestion and not suggestion.startswith("Error:"):
                all_suggestions.append(suggestion)
            total_scans += 1

    visibility_score = round(
        total_mentioned / total_scans * 100 if total_scans > 0 else 0, 1
    )

    return {
        "brand":            brand_name,
        "domain":           domain,
        "visibility_score": visibility_score,
        "total_scans":      total_scans,
        "times_mentioned":  total_mentioned,
        "engines_used":     successful_engines,
        "engine_errors":    engine_errors,
        "real_data":        True,
        "top_competitors":  list(dict.fromkeys(all_competitors))[:5],
        "top_suggestions":  list(dict.fromkeys(all_suggestions))[:3],
        "trend": {
            "newly_mentioned": newly_mentioned,
            "lost_mentions":   lost_mentions,
        },
        "status": "complete",
        "premium_engines_available": [
            "ChatGPT", "Perplexity", "Claude"
        ]
    }


def _analyze_response(raw_response: str, brand_name: str, engine: str, query: str, groq_api_key: str = "") -> dict:
    """
    Score an AI engine response for brand visibility.
    Uses simple string matching — no external API calls, no system key usage.
    """
    import re
    response_lower = raw_response.lower()
    
    # Normalize brand name for matching (handle accents, special chars)
    brand_lower = brand_name.lower()
    brand_simple = re.sub(r'[^a-z0-9\s]', '', brand_lower).strip()
    
    # Check if brand is mentioned
    brand_mentioned = (
        brand_lower in response_lower or
        brand_simple in response_lower or
        any(word in response_lower for word in brand_simple.split() if len(word) > 3)
    )
    
    # Simple sentiment
    sentiment = "not_mentioned"
    if brand_mentioned:
        positive_words = ["best", "top", "excellent", "premium", "recommended", "popular", "leading"]
        negative_words = ["worst", "avoid", "poor", "bad", "inferior"]
        if any(w in response_lower for w in positive_words):
            sentiment = "positive"
        elif any(w in response_lower for w in negative_words):
            sentiment = "negative"
        else:
            sentiment = "neutral"
    
    # Find position (which paragraph/sentence mentions brand)
    position = 0
    if brand_mentioned:
        sentences = raw_response.split('.')
        for i, sentence in enumerate(sentences):
            if brand_lower in sentence.lower() or brand_simple in sentence.lower():
                position = i + 1
                break
    
    return {
        "brand_mentioned": brand_mentioned,
        "position": position,
        "sentiment": sentiment,
        "competitors": [],
        "suggestion": "",
        "response": raw_response[:500],
        "engine": engine,
        "real": True,
    }


def run_competitor_benchmark(brand_id: str, org_id: str) -> dict:
    """
    Run GEO scans against all tracked competitors using the brand's last-used queries.
    Stores per-scan results in competitor_scans and returns side-by-side visibility scores.
    """
    brand_rows = execute_query(
        "SELECT name, domain FROM brands WHERE id = %s", (brand_id,)
    )
    if not brand_rows:
        return {"error": "Brand not found"}
    brand_name, brand_domain = brand_rows[0]

    comp_rows = execute_query(
        "SELECT id, competitor_name, competitor_domain FROM tracked_competitors WHERE brand_id = %s ORDER BY created_at",
        (brand_id,)
    )
    if not comp_rows:
        return {"error": "No competitors tracked — add competitors via POST /api/brands/{brand_id}/competitors"}

    query_rows = execute_query("""
        SELECT DISTINCT query FROM engine_scans
        WHERE brand_id = %s
        ORDER BY query
        LIMIT 3
    """, (brand_id,))
    if not query_rows:
        return {"error": "No brand scans found — run a brand scan first so the benchmark uses the same queries"}

    queries = [r[0] for r in query_rows]

    # Fetch API keys before query filtering so groq_key is available for fallback generation
    groq_key       = get_org_api_key(org_id, "groq")      if org_id else ""
    anthropic_key  = get_org_api_key(org_id, "anthropic") if org_id else ""
    openai_key     = get_org_api_key(org_id, "openai")    if org_id else ""
    perplexity_key = get_org_api_key(org_id, "perplexity") if org_id else ""
    gemini_key     = get_org_api_key(org_id, "gemini")    if org_id else ""

    # Filter out brand-specific queries for fair competitor comparison
    brand_name_lower = brand_name.lower()
    brand_domain_lower = brand_domain.lower().replace("https://", "").replace("http://", "").split("/")[0]
    category_queries = [
        q for q in queries
        if brand_name_lower not in q.lower()
        and brand_domain_lower not in q.lower()
    ]
    if not category_queries:
        # Use a Groq call to generate smart category queries
        try:
            _gen_client = Groq(api_key=groq_key, max_retries=0, timeout=10.0) if groq_key else None
            gen = _gen_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": f"Generate 3 short search queries (max 6 words each) that someone would use to find companies like {brand_name} ({brand_domain}). Return only the queries, one per line, no numbering."}],
                max_tokens=100,
                temperature=0.3,
            )
            raw = gen.choices[0].message.content.strip()
            category_queries = [q.strip() for q in raw.split("\n") if q.strip()][:3]
        except Exception:
            category_queries = [f"best {brand_name} competitors", f"companies like {brand_name}"]
    queries = category_queries[:3]

    active_engines = []
    if groq_key:       active_engines.append("Groq")
    if anthropic_key:  active_engines.append("Claude")
    if openai_key:     active_engines.append("ChatGPT")
    if perplexity_key: active_engines.append("Perplexity")
    if gemini_key:     active_engines.append("Gemini")

    if not active_engines:
        return {"error": "No API keys configured", "setup_url": "/settings"}

    # Brand's own cached visibility (from existing scans — not re-scanned here)
    brand_vis = execute_query("""
        SELECT COUNT(*), SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)
        FROM engine_scans WHERE brand_id = %s
    """, (brand_id,))
    brand_total = int(brand_vis[0][0] or 0)
    brand_mentioned_count = int(brand_vis[0][1] or 0)
    brand_score = round(brand_mentioned_count / max(brand_total, 1) * 100, 1)

    # Build org Groq client once — reused across all competitors and queries
    import groq as groq_lib
    org_groq_client = groq_lib.Groq(api_key=groq_key, max_retries=0, timeout=10.0) if groq_key else None

    competitors_results = []

    for comp_id, comp_name, comp_domain in comp_rows:
        total_scans = 0
        total_mentioned = 0
        engine_breakdown = {}

        for query in queries:
            for engine in active_engines:
                if engine == "Claude":
                    result = query_anthropic_real(query, comp_name, "", anthropic_key)
                elif engine == "ChatGPT":
                    result = query_openai_real(query, comp_name, "", openai_key)
                elif engine == "Perplexity":
                    result = query_perplexity_real(query, comp_name, "", perplexity_key)
                elif engine == "Gemini":
                    result = query_gemini_real(query, comp_name, gemini_key)
                else:  # Groq
                    try:
                        result = query_groq_real(query, comp_name, client=org_groq_client, api_key=groq_key)
                    except Exception:
                        result = {"brand_mentioned": False, "position": 0, "sentiment": "error", "competitors": [], "suggestion": "", "response": "", "engine": "Groq", "real": True}

                # Skip error results — don't persist or count failed API calls
                if result.get("sentiment") == "error" or result.get("error"):
                    continue

                execute_write("""
                    INSERT INTO competitor_scans
                    (brand_id, competitor_id, competitor_name, competitor_domain,
                     engine_name, query, brand_mentioned, sentiment, position, response)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    brand_id, str(comp_id), comp_name, comp_domain,
                    engine, query,
                    result.get("brand_mentioned", False),
                    result.get("sentiment", "not_mentioned"),
                    result.get("position", 0),
                    (result.get("response") or "")[:500]
                ))

                mentioned = result.get("brand_mentioned", False)
                if mentioned:
                    total_mentioned += 1
                total_scans += 1

                if engine not in engine_breakdown:
                    engine_breakdown[engine] = {"scans": 0, "mentions": 0}
                engine_breakdown[engine]["scans"] += 1
                if mentioned:
                    engine_breakdown[engine]["mentions"] += 1

        comp_score = round(total_mentioned / max(total_scans, 1) * 100, 1)
        competitors_results.append({
            "id": str(comp_id),
            "name": comp_name,
            "domain": comp_domain,
            "visibility_score": comp_score,
            "total_scans": total_scans,
            "times_mentioned": total_mentioned,
            "by_engine": [
                {
                    "engine": eng,
                    "scans": stats["scans"],
                    "mentions": stats["mentions"],
                    "visibility_pct": round(stats["mentions"] / max(stats["scans"], 1) * 100, 1),
                }
                for eng, stats in engine_breakdown.items()
            ],
        })

    return {
        "brand": {
            "name": brand_name,
            "domain": brand_domain,
            "visibility_score": brand_score,
            "total_scans": brand_total,
            "times_mentioned": brand_mentioned_count,
        },
        "competitors": sorted(competitors_results, key=lambda x: x["visibility_score"], reverse=True),
        "queries_used": queries,
        "engines_used": active_engines,
        "status": "complete",
    }


def query_anthropic_real(query: str, brand_name: str, brand_context: str = "", api_key: str = "") -> dict:
    """Real Anthropic Claude call via httpx."""
    if not api_key:
        return {"engine": "Claude", "brand_mentioned": False, "sentiment": "error", "error": "No API key"}
    try:
        import httpx
        with httpx.Client(timeout=30) as http:
            resp = http.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-haiku-20240307",
                    "max_tokens": 512,
                    "messages": [{"role": "user", "content": query}]
                }
            )
            raw = resp.json()["content"][0]["text"]
            result = _analyze_response(raw, brand_name, "Claude", query)
            result["is_real"] = True
            return result
    except Exception as e:
        return {"engine": "Claude", "brand_mentioned": False, "sentiment": "error", "error": str(e), "response": "", "real": True}


def query_openai_real(query: str, brand_name: str, brand_context: str = "", api_key: str = "") -> dict:
    """Real OpenAI ChatGPT call."""
    if not api_key:
        return {"engine": "ChatGPT", "brand_mentioned": False, "sentiment": "error", "error": "No API key"}
    try:
        import httpx
        with httpx.Client(timeout=30) as http:
            resp = http.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": query}],
                    "max_tokens": 512
                }
            )
            raw = resp.json()["choices"][0]["message"]["content"]
            result = _analyze_response(raw, brand_name, "ChatGPT", query)
            result["is_real"] = True
            return result
    except Exception as e:
        return {"engine": "ChatGPT", "brand_mentioned": False, "sentiment": "error", "error": str(e), "response": "", "real": True}


def query_perplexity_real(query: str, brand_name: str, brand_context: str = "", api_key: str = "") -> dict:
    """Real Perplexity call."""
    if not api_key:
        return {"engine": "Perplexity", "brand_mentioned": False, "sentiment": "error", "error": "No API key"}
    try:
        import httpx
        with httpx.Client(timeout=30) as http:
            resp = http.post(
                "https://api.perplexity.ai/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": "sonar",
                    "messages": [{"role": "user", "content": query}],
                    "max_tokens": 512
                }
            )
            raw = resp.json()["choices"][0]["message"]["content"]
            result = _analyze_response(raw, brand_name, "Perplexity", query)
            result["is_real"] = True
            return result
    except Exception as e:
        return {"engine": "Perplexity", "brand_mentioned": False, "sentiment": "error", "error": str(e), "response": "", "real": True}
