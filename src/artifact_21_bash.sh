# 1. Clone & Build Solana Anchor Program
git clone https://github.com/sponsor/season-zero-pump-pool-3.git
cd season-zero-pump-pool-3
anchor build

# 2. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --provider.cluster devnet

# 3. Build & Run Client Video Generator & Quest CLI
cd client
npm install
npm run build

# 4. Generate dynamic explainer video for Pool 3
./dist/cli.js generate-video --tvl 2450000 --apy 58.2 --output ./season_zero_pool3_explainer.mp4