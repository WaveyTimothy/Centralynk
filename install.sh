#!/bin/bash
echo "Installing Centralynk..."

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is required. Install from https://docker.com"
    exit 1
fi

# Create directory
mkdir -p ~/centralynk && cd ~/centralynk

# Download compose file
curl -fsSL https://raw.githubusercontent.com/WaveyTimothy/Centralynk/main/docker-compose.simple.yml -o docker-compose.yml

# Download env example
curl -fsSL https://raw.githubusercontent.com/WaveyTimothy/Centralynk/main/.env.example -o .env

# Generate random secrets
SECRET_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

# Update .env with generated secrets
sed -i '' "s/changeme123/$POSTGRES_PASSWORD/g" .env 2>/dev/null || sed -i "s/changeme123/$POSTGRES_PASSWORD/g" .env
sed -i '' "s/change-this-to-a-random-32-char-string/$SECRET_KEY/g" .env 2>/dev/null || sed -i "s/change-this-to-a-random-32-char-string/$SECRET_KEY/g" .env

# Start
docker compose up -d

echo ""
echo "✅ Centralynk is running!"
echo "👉 Open http://localhost:3000"
echo "📖 Docs: https://centralynk.com/docs"
