# 1. Build and test smart contract
anchor build
anchor test

# 2. Deploy Anchor Program to Solana Devnet / Mainnet-Beta
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --program-name season_zero_core

# 3. Launch off-chain verification microservice
docker-compose up -d --build

# 4. Monitor logs & telemetry
docker-compose logs -f --tail=100