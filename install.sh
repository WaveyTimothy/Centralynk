#!/bin/bash
echo "Installing Centralynk..."

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required. Install from https://docker.com"
    exit 1
fi

# Create directory
mkdir -p ~/centralynk && cd ~/centralynk

# Download files from GitHub
BASE="https://raw.githubusercontent.com/WaveyTimothy/Centralynk/main"

echo "Downloading files..."
curl -fsSL "$BASE/docker-compose.simple.yml" -o docker-compose.yml || { echo "❌ Failed to download docker-compose.yml"; exit 1; }
curl -fsSL "$BASE/.env.example" -o .env || { echo "❌ Failed to download .env"; exit 1; }

# Clone the full repo for backend/frontend code
echo "Cloning repository..."
git clone https://github.com/WaveyTimothy/Centralynk.git repo
cp -r repo/backend ./backend
cp -r repo/frontend ./frontend
cp -r repo/docker ./docker
rm -rf repo

# Generate random secrets
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

# Update .env
sed -i "s/changeme123/$POSTGRES_PASSWORD/g" .env
sed -i "s/change-this-to-a-random-32-char-string/$SECRET_KEY/g" .env
sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASSWORD/" .env

echo ""
echo "Starting Centralynk..."
docker compose up -d

echo ""
echo "✅ Centralynk is running!"
echo "👉 Open http://localhost:3000"
echo "📖 Add your Groq API key in Settings to start scanning"
echo "📖 Docs: https://centralynk.com/docs"
