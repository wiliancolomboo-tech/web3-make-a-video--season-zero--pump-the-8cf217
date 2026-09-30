// src/orchestrator.ts
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as ed25519 from "@noble/ed25519";
import axios from "axios";
import { DynamicVideoEngine, VideoMetadata } from "./render_engine";

export interface OrchestratorConfig {
  rpcUrl: string;
  oracleKeypair: Keypair;
  discordWebhookUrl?: string;
  resendApiKey?: string;
}

export class SeasonZeroOrchestrator {
  private connection: Connection;
  private videoEngine: DynamicVideoEngine;

  constructor(private config: OrchestratorConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.videoEngine = new DynamicVideoEngine();
  }

  /**
   * Generates Ed25519 instruction & signature payload for on-chain contract submission
   */
  public async generateQuestAttestation(
    userPubkey: PublicKey,
    questBit: number,
    lpAmountLamports: bigint
  ): Promise<{ ed25519Ix: TransactionInstruction; signature: Uint8Array }> {
    // Message payload: [32-byte pubkey | 1-byte questBit | 8-byte lpAmount (LE)]
    const msgBuffer = Buffer.alloc(41);
    userPubkey.toBuffer().copy(msgBuffer, 0);
    msgBuffer.writeUInt8(questBit, 32);
    msgBuffer.writeBigUInt64LE(lpAmountLamports, 33);

    const privKey = this.config.oracleKeypair.secretKey.slice(0, 32);
    const signature = await ed25519.sign(msgBuffer, privKey);

    // Construct native Solana Ed25519Program instruction
    const ed25519Ix = this.createEd25519Instruction(
      this.config.oracleKeypair.publicKey.toBytes(),
      signature,
      msgBuffer
    );

    return { ed25519Ix, signature };
  }

  /**
   * Dispatches Discord notification with video attachment metadata
   */
  public async dispatchDiscordWebhook(meta: VideoMetadata, videoPath: string): Promise<void> {
    if (!this.config.discordWebhookUrl) return;

    const payload = {
      username: "Season Zero: Pump the Pool 3 Bot",
      avatar_url: "https://solana.com/src/img/branding/solanaLogoMark.png",
      embeds: [
        {
          title: "🚀 New Season Zero Quest & Dynamic Pool Verification!",
          color: 0x14f195,
          fields: [
            { name: "Liquidity Provider", value: `\`${meta.userPubkey}\``, inline: false },
            { name: "Dynamic Pool 3 LP", value: `${(Number(meta.lpAmountLamports) / 1e9).toFixed(3)} SOL`, inline: true },
            { name: "Season Zero XP", value: `+${meta.totalXp} XP`, inline: true },
            { name: "Quests Verified", value: meta.completedQuests.join(", "), inline: false },
            { name: "On-Chain Tx", value: `[Explorer](https://solscan.io/tx/${meta.txSignature}?cluster=devnet)`, inline: false },
          ],
          footer: { text: "Generated via Programmatic Video Engine v3" },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await axios.post(this.config.discordWebhookUrl, payload);
      console.log(`[Notification] Discord alert successfully sent for ${meta.userPubkey}`);
    } catch (err: any) {
      console.error(`[Notification] Discord error: ${err.message}`);
    }
  }

  /**
   * Helper to format Solana Ed25519 native instruction bytes
   */
  private createEd25519Instruction(
    pubkey: Uint8Array,
    signature: Uint8Array,
    message: Uint8Array
  ): TransactionInstruction {
    const ED25519_PROGRAM_ID = new PublicKey("Ed25519SigVerify111111111111111111111111111");
    const numSignatures = 1;
    const padding = 0;

    const signatureOffset = 16;
    const signatureInstructionIndex = 0xffff;
    const publicKeyOffset = signatureOffset + 64;
    const publicKeyInstructionIndex = 0xffff;
    const messageDataOffset = publicKeyOffset + 32;
    const messageDataSize = message.length;
    const messageInstructionIndex = 0xffff;

    const header = Buffer.alloc(16);
    header.writeUInt8(numSignatures, 0);
    header.writeUInt8(padding, 1);
    header.writeUInt16LE(signatureOffset, 2);
    header.writeUInt16LE(signatureInstructionIndex, 4);
    header.writeUInt16LE(publicKeyOffset, 6);
    header.writeUInt16LE(publicKeyInstructionIndex, 8);
    header.writeUInt16LE(messageDataOffset, 10);
    header.writeUInt16LE(messageDataSize, 12);
    header.writeUInt16LE(messageInstructionIndex, 14);

    const instructionData = Buffer.concat([header, signature, pubkey, message]);

    return new TransactionInstruction({
      programId: ED25519_PROGRAM_ID,
      keys: [],
      data: instructionData,
    });
  }
}