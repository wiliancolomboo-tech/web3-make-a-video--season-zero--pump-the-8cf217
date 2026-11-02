# 1. Install dependencies & build Anchor smart contracts
yarn install
anchor build

# 2. Deploy to Solana Devnet / Mainnet
solana config set --url https://api.devnet.solana.com
solana airdrop 2
anchor deploy --program-name quest_stream

# 3. Synchronize program keys
anchor keys sync