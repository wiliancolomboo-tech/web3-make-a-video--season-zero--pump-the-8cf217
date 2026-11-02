# Clean, test and build Anchor program
anchor build

# Deploy to Solana Devnet or Mainnet-Beta
solana config set --url devnet
solana airdrop 2
anchor deploy --program-name pump_quest_pool

# Initialize Campaign #3 for Season Zero, Pump the Pool 3
npx ts-node scripts/init_campaign.ts \
  --campaign-id 3 \
  --reward-per-claim 100000000 \
  --max-claims 500