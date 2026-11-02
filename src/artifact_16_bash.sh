# Set Solana cluster configuration
solana config set --url https://api.devnet.solana.com

# Build Anchor binary
anchor build

# Sync Program ID across declare_id and Anchor.toml
anchor keys sync

# Deploy to Solana
solana program deploy ./target/deploy/ptp3_season_zero.so --program-id AuraQpTP3SeasonZero11111111111111111111111111