# Export webhook environment credentials
export DISCORD_WEBHOOK_URL="https://api.example.com/webhooks/alerts/placeholder"
export SLACK_WEBHOOK_URL="https://api.example.com/webhooks/alerts/placeholder"

# Spin up daemonized container
docker-compose up -d --build

# Verify container runtime logs & health
docker logs -f solana_quest_vision_engine
curl http://localhost:8080/health