import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, Idl, BN } from "@coral-xyz/anchor";
import nacl from "tweetnacl";
import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Enterprise Configuration
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const SOLANA_WS_URL = process.env.SOLANA_WS_URL || "wss://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || "QstStrm111111111111111111111111111111111111"
);
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

export class QuestStreamOracleService {
  private connection: Connection;
  private oracleKeypair: Keypair;

  constructor() {
    this.connection = new Connection(SOLANA_RPC_URL, {
      wsEndpoint: SOLANA_WS_URL,
      commitment: "confirmed",
    });

    const secretKeyString = process.env.ORACLE_SECRET_KEY;
    if (!secretKeyString) {
      throw new Error("Missing ORACLE_SECRET_KEY in environment");
    }
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    this.oracleKeypair = Keypair.fromSecretKey(secretKey);
  }

  /**
   * Generates a deterministic 32-byte content hash from a video URL and platform metadata.
   */
  public generateVideoContentHash(rawVideoBuffer: Buffer, videoMetadataUrl: string): Buffer {
    const hash = crypto.createHash("sha256");
    hash.update(rawVideoBuffer);
    hash.update(Buffer.from(videoMetadataUrl, "utf-8"));
    return hash.digest();
  }

  /**
   * Signs the video quest attestation payload: [user (32 bytes) || videoHash (32 bytes) || platformId (1 byte)]
   */
  public signVideoQuestAttestation(
    userPubkey: PublicKey,
    videoHash: Buffer,
    platformId: number
  ): Uint8Array {
    if (videoHash.length !== 32) {
      throw new Error("videoHash must be exactly 32 bytes");
    }
    const payload = Buffer.concat([
      userPubkey.toBuffer(),
      videoHash,
      Buffer.from([platformId]),
    ]);

    return nacl.sign.detached(payload, this.oracleKeypair.secretKey);
  }

  /**
   * Dispatches alerts to Discord Webhook.
   */
  public async dispatchDiscordNotification(title: string, description: string, fields: any[]) {
    if (!DISCORD_WEBHOOK_URL) return;
    try {
      await axios.post(DISCORD_WEBHOOK_URL, {
        embeds: [
          {
            title: `🚀 [Season Zero] ${title}`,
            description,
            color: 0x14f195, // Solana Green
            fields,
            footer: {
              text: `QuestStream Protocol • ${new Date().toISOString()}`,
            },
          },
        ],
      });
    } catch (err: any) {
      console.error("[Telemetry] Failed to post to Discord:", err.message);
    }
  }

  /**
   * Dispatches transactional proof emails via Resend API.
   */
  public async dispatchResendEmail(recipientEmail: string, userPubkey: string, questName: string) {
    if (!RESEND_API_KEY) return;
    try {
      await axios.post(
        "https://api.resend.com/emails",
        {
          from: "Season Zero Notifications <quests@queststream.io>",
          to: [recipientEmail],
          subject: `Verified: ${questName} Completed!`,
          html: `<p>Congratulations <strong>${userPubkey}</strong>,</p>
                 <p>Your video quest for <strong>${questName}</strong> and LP commitments have been verified on-chain.</p>
                 <p>Your Season Zero rewards are now claimable.</p>`,
        },
        {
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (err: any) {
      console.error("[Email Engine] Failed to dispatch Resend email:", err.message);
    }
  }

  /**
   * Real-time WebSocket listener monitoring Season Zero program on Solana.
   */
  public listenToOnChainEvents() {
    console.log(`[QuestStream Oracle] Listening to Program Events on ${SOLANA_RPC_URL}...`);

    this.connection.onLogs(
      PROGRAM_ID,
      async (logs) => {
        for (const log of logs.logs) {
          if (log.includes("VideoQuestVerifiedEvent")) {
            console.log("[Event] Video Quest Verified on-chain:", log);
            await this.dispatchDiscordNotification(
              "Video Quest Verified",
              "A creator just successfully had their Season Zero Video verified.",
              [{ name: "Tx Signature", value: logs.signature }]
            );
          } else if (log.includes("LiquidityLockedEvent")) {
            console.log("[Event] Liquidity Added to Pump the Pool 3:", log);
            await this.dispatchDiscordNotification(
              "Pump the Pool 3 Liquidity Deposited",
              "New LP token escrow confirmed.",
              [{ name: "Tx Signature", value: logs.signature }]
            );
          }
        }
      },
      "confirmed"
    );
  }
}

// Direct Execution Mode
if (require.main === module) {
  const service = new QuestStreamOracleService();
  service.listenToOnChainEvents();
}