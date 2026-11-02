# 1. Clone & Setup Workspace
git clone https://github.com/sponsor-org/season-zero-pump-pool.git
cd season-zero-pump-pool

# 2. Build Anchor Smart Contracts
anchor build

# 3. Synchronize Program ID
solana address -k target/deploy/season_zero_engine-keypair.json
# Ensure ID matches declare_id!() in lib.rs

# 4. Deploy to Solana Devnet
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# 5. Install Client Dependencies & Execute Tests
npm install
anchor test