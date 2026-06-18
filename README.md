cat > ~/projects/geo-tool/README.md << 'EOF'
# Centralynk — Open Source GEO Platform

> Track and improve your brand's visibility in AI search engines like ChatGPT, Perplexity, Claude and Google AI Overview.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.136-green)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/docker-compose-blue)](https://docker.com)

## What is Centralynk?

Centralynk is an open-source **Generative Engine Optimization (GEO)** platform. It tracks how often your brand appears in AI-generated responses and tells you exactly what to fix.

**The problem:** AI search engines (ChatGPT, Perplexity, Claude, Google AI Overview) are becoming the primary way people discover products and services. Traditional SEO doesn't work here. You need GEO.

**The solution:** Centralynk scans AI engines with queries relevant to your brand, measures your visibility score, and uses an AI analyst agent to generate specific, actionable recommendations.

## Features

- 🔍 **Real GEO scanning** — actual API calls to AI engines, no simulations
- 🤖 **AI analyst agent** — reads scan data, writes structured recommendations
- 📈 **Self-learning feedback loop** — every output scored, quality improves over time
- 📊 **Visibility trend chart** — track your score over time
- 🏆 **Competitor tracking** — compare your visibility vs competitors
- 📄 **llms.txt generator** — tell AI crawlers how to cite your brand
- 🔧 **Schema.org generator** — JSON-LD markup for AI-readable structured data
- 🔎 **Semantic HTML auditor** — score your site's AI readability
- 🏢 **Multi-tenant** — multiple organisations, complete data isolation
- 🔑 **BYOK** — bring your own API keys (8 providers)
- 🏠 **Self-hosted** — your data never leaves your infrastructure

## Quick Start

```bash
# 1. Clone
git clone https://github.com/WaveyTimothy/Centralynk
cd Centralynk

# 2. Configure
cp .env.example .env
# Edit .env — add your API keys

# 3. Run
docker compose up -d

# 4. Health check
curl http://localhost:8080/health
```

## Supported AI Engines (BYOK)

All engines require your own API key — get them free or paid from each provider:

| Engine | Provider | Get API Key |
|--------|----------|-------------|
| Groq (Llama 3.3) | Groq | [console.groq.com](https://console.groq.com) — free tier available |
| Gemini | Google | [ai.google.dev](https://ai.google.dev) |
| ChatGPT | OpenAI | [platform.openai.com](https://platform.openai.com) |
| Claude | Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| Perplexity | Perplexity | [perplexity.ai/settings/api](https://perplexity.ai/settings/api) |
| Mistral | Mistral | [console.mistral.ai](https://console.mistral.ai) |
| Cohere | Cohere | [dashboard.cohere.com](https://dashboard.cohere.com) |
| xAI (Grok) | xAI | [console.x.ai](https://console.x.ai) |

## Self-Learning Feedback Loop

Centralynk gets smarter over time without fine-tuning or retraining:

1. Agent produces output (recommendation, content, analysis)
2. Output auto-scored 1-5 using your configured LLM
3. Score ≥ 4 → stored as few-shot example in your database
4. Next run injects best past examples into the prompt
5. Quality improves with every scan — using YOUR data, on YOUR server

The scoring model is configurable:
```bash
FEEDBACK_LOOP_PROVIDER=groq
FEEDBACK_LOOP_MODEL=llama-3.3-70b-versatile
```

Swap to any supported provider. Use a powerful model for scoring, a fast model for generation.

## Architecture
┌─────────────────────────────────────────┐

│           Centralynk Platform           │

├─────────────┬───────────────────────────┤

│   FastAPI   │   Celery Beat + Workers   │

│   REST API  │   Scheduled rescans       │

├─────────────┴───────────────────────────┤

│          PostgreSQL + pgvector          │

│    Brands · Scans · Recommendations     │

│    Feedback Store · Tone Profiles       │

├─────────────────────────────────────────┤

│              AI Layer                   │

│  BYOK: Groq · Gemini · OpenAI · Claude │

│  Analyst Agent · Marketing Agent        │

│  Self-Learning Feedback Loop            │

└─────────────────────────────────────────┘

## Environment Variables

See `.env.example` for full configuration. Minimum required:

```bash
GROQ_API_KEY=your_groq_key
POSTGRES_USER=geo_user
POSTGRES_PASSWORD=changeme
POSTGRES_DB=geo_db
SECRET_KEY=generate-with-openssl-rand-hex-32
ADMIN_KEY=your-strong-admin-key
```

## What's Included (Free Forever)

✅ GEO scanning across all supported engines (BYOK)  
✅ AI analyst agent with actionable recommendations  
✅ Self-learning feedback loop  
✅ Competitor tracking  
✅ llms.txt + Schema.org generators  
✅ Semantic HTML auditor  
✅ Multi-tenant organisation model  
✅ Visibility trend chart  
✅ BYOK for 8 AI providers  
✅ JWT auth + rate limiting  
✅ Full Docker Compose deployment  

## Centralynk Cloud

Don't want to manage your own server?  
[centralynk.com](https://centralynk.com) offers a managed cloud version with:
- No server setup required
- Scan credits included
- Priority support
- Enterprise features

## Roadmap

Open source (coming soon):
- [ ] Prompt discovery agent
- [ ] Citation source intelligence
- [ ] Multi-region scanning

Cloud/Enterprise:
- [ ] GA4 + revenue attribution
- [ ] White-label reports
- [ ] Agency multi-client workspace
- [ ] SSO + audit logs

## Contributing

PRs welcome. Issues, feature requests, and bug reports appreciated.

## License

MIT © Tim Devlamynck — [centralynk.com](https://centralynk.com)
EOF

git add README.md LICENSE
git rm "=" 2>/dev/null || true
git commit -m "docs: add MIT license and complete README"
git push

echo "Done — check github.com/WaveyTimothy/Centralynk"
