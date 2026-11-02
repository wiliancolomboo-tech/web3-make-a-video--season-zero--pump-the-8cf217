# 1. Build and test on local Solana test-validator
anchor build
anchor test

# 2. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# 3. Spin up the enterprise off-chain orchestration worker
docker-compose up -d --build

# 4. Check real-time service health
curl http://localhost:8080/health