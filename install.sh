#!/bin/bash
echo "Installing Centralynk..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required. Install from https://docker.com"
    exit 1
fi

mkdir -p ~/centralynk && cd ~/centralynk

BASE="https://raw.githubusercontent.com/WaveyTimothy/Centralynk/main"

echo "Downloading files..."
curl -fsSL "$BASE/docker-compose.simple.yml" -o docker-compose.yml || { echo "❌ Failed to download docker-compose.yml"; exit 1; }
curl -fsSL "$BASE/.env.example" -o .env || { echo "❌ Failed to download .env"; exit 1; }

echo "Cloning repository..."
git clone https://github.com/WaveyTimothy/Centralynk.git repo
cp -r repo/backend ./backend
cp -r repo/frontend ./frontend
cp -r repo/docker ./docker
rm -rf repo

SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
ADMIN_KEY=$(openssl rand -hex 16)

# Cross-platform sed (works on Mac and Linux)
python3 -c "
import re
with open('.env', 'r') as f:
    content = f.read()
content = content.replace('changeme123', '$POSTGRES_PASSWORD')
content = content.replace('change-this-to-a-random-32-char-string', '$SECRET_KEY')
content = content.replace('changeme-admin-key', '$ADMIN_KEY')
content = re.sub(r'REDIS_PASSWORD=.*', 'REDIS_PASSWORD=$REDIS_PASSWORD', content)
with open('.env', 'w') as f:
    f.write(content)
"

echo "Starting Centralynk..."
docker compose up -d

echo "Waiting for API to start..."
API_READY=false
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        API_READY=true
        break
    fi
    sleep 2
done

if [ "$API_READY" != "true" ]; then
    echo "⚠️  API didn't come up in time. Once it's ready, generate an access code with:"
    echo "curl -s -X POST \"http://localhost:8080/api/admin/generate-code?admin_key=$ADMIN_KEY\" -H \"Content-Type: application/json\" -d '{\"email\": \"you@example.com\", \"max_scans\": 10000}'"
    exit 0
fi

read -p "Enter your email address: " USER_EMAIL

RESPONSE=$(curl -s -X POST "http://localhost:8080/api/admin/generate-code?admin_key=$ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER_EMAIL\", \"max_scans\": 10000}")

CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['code'])" 2>/dev/null)

echo ""
echo "✅ Centralynk is running!"
echo "👉 Open http://localhost:3000"
if [ -n "$CODE" ]; then
    echo "📧 Email: $USER_EMAIL"
    echo "🔑 Access code: $CODE"
    echo ""
    echo "Use these credentials to sign in."
else
    echo "⚠️  Couldn't generate an access code automatically (response: $RESPONSE)"
    echo "Retry with: curl -s -X POST \"http://localhost:8080/api/admin/generate-code?admin_key=$ADMIN_KEY\" -H \"Content-Type: application/json\" -d '{\"email\": \"$USER_EMAIL\", \"max_scans\": 10000}'"
fi
echo "📖 Add your Groq API key in Settings to start scanning"
