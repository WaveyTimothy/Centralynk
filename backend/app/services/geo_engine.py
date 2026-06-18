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

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY", ""))

def get_org_api_key(org_id: str, provider: str) -> str:
    """
    BYOK: Check if org has their own API key for this provider.
    Falls back to system key if not set.
    Free tier uses system Groq key.
    Pro/Enterprise can bring their own.
    """
    if not org_id:
        return os.getenv(f"{provider.upper()}_API_KEY", "")
    try:
        from app.core.database import execute_query as eq
        rows = eq(
            "SELECT api_keys->%s FROM organisations WHERE id = %s",
            (provider, org_id)
        )
        if rows and rows[0][0]:
            return rows[0][0]
    except Exception:
        pass
    return os.getenv(f"{provider.upper()}_API_KEY", "")



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


def query_groq_real(query: str, brand_name: str, brand_context: str = "", client=None) -> dict:
    """
    Real Groq query — asks Groq directly, then analyzes the response.
    Groq is presented as itself, not as a simulation of another engine.
    """
    MAX_RETRIES = 3
    _client = client or groq_client

    for attempt in range(MAX_RETRIES):
        try:
            # Step 1: real Groq response to the query
            # Inject brand context to prevent domain confusion (GEO = geography vs GEO = generative engine optimization)
            contextualized_query = query  # Send raw query — no brand context injection
            completion = _client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": contextualized_query}],
                max_tokens=512,
                temperature=0.3,
            )
            raw_response = completion.choices[0].message.content.strip()

            # Step 2: analyze the response for brand visibility
            analysis_prompt = f"""Analyze this AI response for brand visibility.

Query: "{query}"
Brand to track: "{brand_name}"
AI Response: "{raw_response[:1000]}"

Return ONLY valid JSON, no markdown:
{{
    "brand_mentioned": true or false,
    "position": 0,
    "sentiment": "positive|neutral|negative|not_mentioned",
    "competitors": ["name1", "name2"],
    "suggestion": "one specific improvement tip to get mentioned"
}}"""

            analysis = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": analysis_prompt}],
                max_tokens=256,
                temperature=0.1,
            )
            raw_analysis = analysis.choices[0].message.content.strip()
            start = raw_analysis.find("{")
            end = raw_analysis.rfind("}") + 1
            if start == -1 or end == 0:
                time.sleep(2 ** attempt)
                continue

            result = json.loads(raw_analysis[start:end])
            result["response"] = raw_response[:500]
            result["engine"] = "Groq"
            result["real"] = True
            return result

        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                return {
                    "engine": "Groq",
                    "brand_mentioned": False,
                    "position": 0,
                    "sentiment": "error",
                    "competitors": [],
                    "suggestion": f"Error: {str(e)}",
                    "response": "",
                    "real": True,
                }
            time.sleep(2 ** attempt)

    return {
        "engine": "Groq",
        "brand_mentioned": False,
        "sentiment": "error",
        "real": True,
    }


def query_gemini_real(query: str, brand_name: str) -> dict:
    """
    Real Gemini query via google-generativeai.
    Two-step: query → analyze response for brand visibility.
    """
    try:
        import google.generativeai as genai
        genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
        model = genai.GenerativeModel("gemini-2.0-flash")

        # Step 1: real Gemini response
        response = model.generate_content(
            query,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=512,
                temperature=0.3,
            )
        )
        raw_response = response.text

        # Step 2: analyze with Groq (cheaper + faster for analysis)
        analysis_prompt = f"""Analyze this AI response for brand visibility.

Query: "{query}"
Brand to track: "{brand_name}"
AI Response: "{raw_response[:1000]}"

Return ONLY valid JSON, no markdown:
{{
    "brand_mentioned": true or false,
    "position": 0,
    "sentiment": "positive|neutral|negative|not_mentioned",
    "competitors": ["name1", "name2"],
    "suggestion": "one specific improvement tip"
}}"""

        analysis = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": analysis_prompt}],
            max_tokens=256,
            temperature=0.1,
        )
        raw_analysis = analysis.choices[0].message.content.strip()
        start = raw_analysis.find("{")
        end = raw_analysis.rfind("}") + 1

        if start != -1 and end != 0:
            result = json.loads(raw_analysis[start:end])
            result["response"] = raw_response[:500]
            result["engine"] = "Gemini"
            result["real"] = True
            return result

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

    for query in queries:
        for engine in active_engines:

            # Get previous scan for trend diff
            previous = get_previous_scan(brand_id, engine, query)

            # Real engine call
            if engine == "Claude":
                result = query_anthropic_real(query, brand_name, brand_context, get_org_api_key(org_id, "anthropic"))
            elif engine == "ChatGPT":
                result = query_openai_real(query, brand_name, brand_context, get_org_api_key(org_id, "openai"))
            elif engine == "Perplexity":
                result = query_perplexity_real(query, brand_name, brand_context, get_org_api_key(org_id, "perplexity"))
            elif engine == "Gemini":
                result = query_gemini_real(query, brand_name)
            else:  # Groq — use org key if available (BYOK)
                org_groq_key = get_org_api_key(org_id, "groq")
                if org_groq_key != os.getenv("GROQ_API_KEY", ""):
                    import groq as groq_lib
                    org_client = groq_lib.Groq(api_key=org_groq_key)
                    result = query_groq_real(query, brand_name, brand_context="", client=org_client)
                else:
                    result = query_groq_real(query, brand_name, brand_context="")

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
            if result.get("suggestion"):
                all_suggestions.append(result.get("suggestion"))
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
        "engines_used":     active_engines,
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
