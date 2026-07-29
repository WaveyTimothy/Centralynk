# Centralynk — Open Source GEO Platform

> Track and improve your brand's visibility in AI search engines like ChatGPT, Perplexity, Claude and Google AI Overview.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green)](https://fastapi.tiangolo.com)
[![Docker](https://img.shields.io/badge/docker-compose-blue)](https://docker.com)

## What is Centralynk?

My first project in my free time! If the front-end is not connecting correctly to the backend, sorry, haven't tried it on another device yet. 
But www.centralynk.com is live, you can also have a look there for more information. I can also provide access to my personally hosted environment, the waitlist is on the website to receive access. 

Centralynk is an open-source **Generative Engine Optimization (GEO)** platform. It tracks how often your brand appears in AI-generated responses and tells you exactly what to fix.

**The problem:** AI search engines (ChatGPT, Perplexity, Claude, Google AI Overview) are becoming the primary way people discover products and services. Traditional SEO doesn't work here. You need GEO.

**The solution:** Centralynk scans AI engines with queries relevant to your brand, measures your visibility score, and uses an AI analyst agent to generate specific, actionable recommendations.

## Free alternative to Profound ($295/mo) and Otterly ($29/mo)

Centralynk is fully open source, self-hosted, and free forever.

## Features

- 🔍 **Real GEO scanning** — actual API calls to AI engines, no simulations
- 🤖 **AI analyst agent** — marketer-friendly recommendations based on scan data
- 📈 **Self-learning feedback loop** — gets smarter with every scan
- 📊 **Visibility trend chart** — track your score over time
- 🏆 **Competitor benchmarking** — compare your visibility vs competitors side by side
- 📄 **llms.txt generator** — tell AI crawlers how to cite your brand
- 🔧 **Schema.org generator** — JSON-LD markup for AI-readable structured data
- 🔎 **HTML auditor** — score your site's AI readability
- 🏢 **Multi-tenant** — multiple organisations, complete data isolation
- 🔑 **BYOK** — bring your own API keys (8 providers supported)
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

| Engine | Provider | Free Tier |
|--------|----------|-----------|
| Groq (Llama 3.3) | [console.groq.com](https://console.groq.com) | ✅ Yes |
| Gemini | [ai.google.dev](https://ai.google.dev) | ✅ Yes |
| ChatGPT | [platform.openai.com](https://platform.openai.com) | ✅ Yes |
| Claude | [console.anthropic.com](https://console.anthropic.com) | ✅ Yes |
| Perplexity | [perplexity.ai/settings/api](https://perplexity.ai/settings/api) | ✅ Yes |
| Mistral | [console.mistral.ai](https://console.mistral.ai) | ✅ Yes |
| Cohere | [dashboard.cohere.com](https://dashboard.cohere.com) | ✅ Yes |
| xAI (Grok) | [console.x.ai](https://console.x.ai) | ✅ Yes |

## Environment Variables

Minimum required in `.env`:

```bash
GROQ_API_KEY=your_groq_key
POSTGRES_USER=geo_user
POSTGRES_PASSWORD=changeme
POSTGRES_DB=geo_db
SECRET_KEY=your-secret-key
REDIS_PASSWORD=your-redis-password
```

See `.env.example` for full configuration.

## Roadmap

- [ ] Prompt discovery agent
- [ ] Citation source intelligence  
- [ ] Multi-region scanning
- [ ] GA4 + revenue attribution
- [ ] White-label reports
- [ ] Agency multi-client workspace

## Contributing

PRs welcome. Issues, feature requests, and bug reports appreciated.

## License

MIT © Tim Devlamynck — [centralynk.com](https://centralynk.com)

## Project Structure
## Self-Host with Frontend

```bash
# Clone
git clone https://github.com/WaveyTimothy/Centralynk
cd Centralynk

# Configure
cp .env.example .env
cp frontend/.env.example frontend/.env
# Edit both .env files

# Run everything
docker compose up -d
```

- Backend API: http://localhost:8080
- Frontend dashboard: http://localhost:3000

## One-line install

```bash
curl -fsSL https://raw.githubusercontent.com/WaveyTimothy/Centralynk/main/install.sh | bash
```

This will:
- Download everything needed
- Generate secure random passwords
- Start all services
- Open at http://localhost:3000
