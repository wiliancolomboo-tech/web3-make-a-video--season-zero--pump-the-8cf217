# Build Anchor bytecode
anchor build

# Deploy to Solana Devnet or Mainnet-Beta
solana config set --url devnet
solana airdrop 2
anchor deploy --program-name pump_the_pool_quests

# Initialize Season Zero Campaign (via Anchor CLI or script)
npx ts-node scripts/init_campaign.ts --season 101 --min-lp 1000000000