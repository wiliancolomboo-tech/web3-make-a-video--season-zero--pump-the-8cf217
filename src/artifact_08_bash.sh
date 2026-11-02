# 1. Clone repository & install dependencies
git clone https://github.com/solana-bounty/season-zero-pool3.git
cd season-zero-pool3
npm install

# 2. Build and Deploy Anchor Smart Contract to Solana Devnet
anchor build
solana program deploy ./target/deploy/season_zero_engine.so --program-id target/deploy/season_zero_engine-keypair.json -u devnet

# 3. Environment Configuration
cp .env.example .env
# Fill SOLANA_RPC_URL, ORACLE_SECRET_KEY, RESEND_API_KEY, and DISCORD_WEBHOOK_URL

# 4. Run Full Automated Test Suite with 100% Assertion Passes
anchor test

# 5. Launch Turnkey Docker Service Worker
docker compose up -d --build

# 6. Verify Service Telemetry & Status
curl http://localhost:8080/health
docker logs -f season_zero_orchestrator