# 1. Install dependencies
yarn install

# 2. Build Anchor Smart Contracts
anchor build

# 3. Synchronize Program ID
solana address -k target/deploy/season_zero_quests-keypair.json
# Ensure ID matches declare_id!() in lib.rs

# 4. Deploy to Solana Devnet / Mainnet-Beta
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# 5. Run complete test verification suite
anchor test