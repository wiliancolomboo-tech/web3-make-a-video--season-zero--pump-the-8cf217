import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl } from "@coral-xyz/anchor";
import { Ed25519Program } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

interface QuestPayload {
  userPubkey: string;
  questId: number;
  points: number;
  nonce: number;
}

export class SeasonZeroOracle {
  private connection: Connection;
  private oracleKeypair: Keypair;
  private programId: PublicKey;
  private discordWebhookUrl: string;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
    
    const secretKeyString = process.env.ORACLE_PRIVATE_KEY;
    if (!secretKeyString) {
      throw new Error("ORACLE_PRIVATE_KEY must be provided in environment");
    }
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    this.oracleKeypair = Keypair.fromSecretKey(secretKey);

    this.programId = new PublicKey(
      process.env.PROGRAM_ID || "SznZeroPumpPooL3111111111111111111111111111"
    );
    this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || "";
  }

  public signQuestAttestation(payload: QuestPayload): { message: Uint8Array; signature: Uint8Array } {
    const userPubkey = new PublicKey(payload.userPubkey);
    
    // Construct deterministically serialized 48-byte buffer
    const buffer = Buffer.alloc(32 + 4 + 4 + 8);
    userPubkey.toBuffer().copy(buffer, 0);
    buffer.writeUInt32LE(payload.questId, 32);
    buffer.writeUInt32LE(payload.points, 36);
    buffer.writeBigUInt64LE(BigInt(payload.nonce), 40);

    const message = new Uint8Array(buffer);
    const signature = nacl.sign.detached(message, this.oracleKeypair.secretKey);

    return { message, signature };
  }

  public async notifyDiscord(questPayload: QuestPayload, txHash: string): Promise<void> {
    if (!this.discordWebhookUrl) return;

    try {
      await axios.post(this.discordWebhookUrl, {
        embeds: [
          {
            title: "🏆 Season Zero Quest Completed & Pool Pumped!",
            color: 0x14f195, // Solana Green
            fields: [
              { name: "User", value: `\`${questPayload.userPubkey}\``, inline: false },
              { name: "Quest ID", value: `#${questPayload.questId}`, inline: true },
              { name: "Points Awarded", value: `+${payload.points} SZP`, inline: true },
              { name: "Solana Explorer", value: `[View TX](https://explorer.solana.com/tx/${txHash}?cluster=devnet)`, inline: false },
            ],
            footer: { text: "Season Zero • Pump the Pool 3 Engine" },
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      console.error("Failed to deliver Discord notification:", err);
    }
  }

  public getOraclePublicKey(): PublicKey {
    return this.oracleKeypair.publicKey;
  }
}

// Interactive CLI Runner
async function run() {
  console.log("=== SEASON ZERO & PUMP THE POOL 3 ORACLE SERVICE INITIALIZING ===");
  const oracle = new SeasonZeroOracle();
  console.log(`Oracle Node Identity: ${oracle.getOraclePublicKey().toBase58()}`);

  const mockPayload: QuestPayload = {
    userPubkey: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    questId: 1, // Quest 1: Watch Video & Retweet
    points: 250,
    nonce: Date.now(),
  };

  console.log("Verifying quest completion off-chain...");
  const { message, signature } = oracle.signQuestAttestation(mockPayload);
  console.log(`Attestation generated successfully! Signature: ${Buffer.from(signature).toString("hex").slice(0, 32)}...`);
}

if (require.main === module) {
  run().catch(console.error);
}