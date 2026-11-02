# 1. Build and test Anchor smart contracts
anchor build
anchor test

# 2. Deploy Anchor Program to Solana Devnet / Mainnet
solana program deploy \
  --program-id target/deploy/season_zero_engine-keypair.json \
  target/deploy/season_zero_engine.so

# 3. Spin up the enterprise oracle verification daemon
docker compose up -d --build

# 4. Verify system telemetry
curl -s http://localhost:8080/health | jq .