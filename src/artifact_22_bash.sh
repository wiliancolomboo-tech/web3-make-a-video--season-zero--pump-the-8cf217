cd client
npm install
npm run build

# Execute pipeline for a participant
node dist/index.js execute-quest \
  --user 7v91N7iZ6mD3peJq2v4R6jF8w2K1U8Z3y6Y8jK2v4R6j \
  --twitter solana_legend \
  --lp 1500 \
  --oracle-keypair ../keys/oracle-keypair.json \
  --email participant@solana.org