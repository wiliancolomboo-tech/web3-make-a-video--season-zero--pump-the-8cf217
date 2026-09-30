# Configure environment
cp .env.example .env
# Fill in ORACLE_PRIVATE_KEY, RPC_URL, and DISCORD_WEBHOOK_URL

# Launch via Docker Compose
docker-compose up -d --build

# Inspect real-time stream logs
docker-compose logs -f season-zero-engine