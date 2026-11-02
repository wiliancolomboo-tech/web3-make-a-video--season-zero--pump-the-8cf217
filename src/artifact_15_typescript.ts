import { PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  programId: new PublicKey(process.env.PROGRAM_ID || "Pump3SeasonZero11111111111111111111111111111"),
  seasonId: parseInt(process.env.SEASON_ID || "0", 10),
  oracleSecretKey: process.env.ORACLE_SECRET_KEY || "",
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || "",
};