# Build binary and IDL
anchor build

# Deploy to Solana Devnet
solana program deploy \
  --program-id target/deploy/pump_the_pool-keypair.json \
  target/deploy/pump_the_pool.so \
  --url https://api.devnet.solana.com

# Verify IDL initialization
anchor idl init --filepath target/idl/pump_the_pool.json <PROGRAM_ID>