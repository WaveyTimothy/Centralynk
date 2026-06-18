import google.generativeai as genai
import os
import json

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def query_gemini_real(query: str, brand_name: str) -> dict:
    """
    Actually query Gemini — real responses not simulated.
    Boris Cherny style — clean, explicit, debuggable.
    """
    MAX_RETRIES = 3
    retry_count = 0

    while retry_count < MAX_RETRIES:
        try:
            model = genai.GenerativeModel("gemini-2.0-flash")
            
            response = model.generate_content(
                f"{query}",
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=512,
                    temperature=0.3
                )
            )
            
            raw_response = response.text
            
            # LLM Critic — analyze the real response
            analysis_prompt = f"""Analyze this AI response for brand visibility:

Query: "{query}"
Brand to track: "{brand_name}"
AI Response: "{raw_response[:1000]}"

Return ONLY this JSON:
{{
    "brand_mentioned": true or false,
    "position": 0,
    "sentiment": "positive|neutral|negative|not_mentioned",
    "competitors": ["competitor1"],
    "suggestion": "one improvement tip"
}}"""

            analysis = model.generate_content(analysis_prompt)
            raw_analysis = analysis.text.strip()
            
            # Parse JSON
            start = raw_analysis.find("{")
            end = raw_analysis.rfind("}") + 1
            if start != -1 and end != 0:
                result = json.loads(raw_analysis[start:end])
                result["response"] = raw_response[:500]
                result["engine"] = "Gemini"
                result["real_query"] = True
                return result
            
            retry_count += 1

        except Exception as e:
            retry_count += 1
            if retry_count >= MAX_RETRIES:
                return {
                    "engine": "Gemini",
                    "brand_mentioned": False,
                    "position": 0,
                    "sentiment": "error",
                    "competitors": [],
                    "suggestion": f"Error: {str(e)}",
                    "real_query": True
                }

    return {
        "engine": "Gemini",
        "brand_mentioned": False,
        "sentiment": "error",
        "real_query": True
    }
