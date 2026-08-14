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

# Cross-platform sed (works on Mac and Linux)
python3 -c "
import re
with open('.env', 'r') as f:
    content = f.read()
content = content.replace('changeme123', '$POSTGRES_PASSWORD')
content = content.replace('change-this-to-a-random-32-char-string', '$SECRET_KEY')
content = re.sub(r'REDIS_PASSWORD=.*', 'REDIS_PASSWORD=$REDIS_PASSWORD', content)
with open('.env', 'w') as f:
    f.write(content)
"

echo "Starting Centralynk..."
docker compose up -d

echo ""
echo "✅ Centralynk is running!"
echo "👉 Open http://localhost:3000"
echo "📖 Add your Groq API key in Settings to start scanning"
