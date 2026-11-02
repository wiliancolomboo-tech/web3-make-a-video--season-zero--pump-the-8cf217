cd engine
npm install
npm run build

# Generate test personalized render and push to configured webhooks
node dist/cli.js render \
  --wallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU \
  --points 8500 \
  --poolSol 32.5 \
  --rank 7 \
  --tier "Titan Diamond Hands"