# 1. Build and verify Anchor smart contract
anchor build
anchor test

# 2. Deploy Anchor Program to Solana Devnet/Mainnet
solana program deploy \
  --program-id target/deploy/season_zero_quests-keypair.json \
  target/deploy/season_zero_quests.so \
  --url mainnet-beta

# 3. Launch Programmatic Video Rendering Engine
npm run render-video

# 4. Start Enterprise Worker Daemon via Docker
docker-compose up -d --build

# 5. Verify Health Endpoint
curl -X GET http://localhost:8080/health