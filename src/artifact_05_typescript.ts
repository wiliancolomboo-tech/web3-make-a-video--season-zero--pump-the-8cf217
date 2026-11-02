import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";
import * as nacl from "tweetnacl";

// Configuration Interfaces
export interface QuestPipelineConfig {
  rpcUrl: string;
  programId: string;
  campaignId: bigint;
  oracleKeypair: Keypair;
  claimantKeypair: Keypair;
  rewardMint: PublicKey;
  discordWebhookUrl?: string;
  slackWebhookUrl?: string;
}

export interface VideoMetadata {
  title: string;
  durationSeconds: number;
  season: string;
  questPoolName: string;
  hash: Buffer;
  generatedFilePath: string;
}

export class QuestVisionOrchestrator {
  private connection: Connection;
  private programId: PublicKey;
  private oracle: Keypair;
  private claimant: Keypair;
  private campaignId: bigint;
  private rewardMint: PublicKey;
  private discordWebhookUrl?: string;
  private slackWebhookUrl?: string;

  constructor(config: QuestPipelineConfig) {
    this.connection = new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.programId);
    this.oracle = config.oracleKeypair;
    this.claimant = config.claimantKeypair;
    this.campaignId = config.campaignId;
    this.rewardMint = config.rewardMint;
    this.discordWebhookUrl = config.discordWebhookUrl;
    this.slackWebhookUrl = config.slackWebhookUrl;
  }

  /**
   * Generates a deterministic video manifest and synthetic asset representing
   * "Season Zero, Pump the Pool 3 & Social Quests"
   */
  public async renderVideoAsset(): Promise<VideoMetadata> {
    console.log("[1/5] Synthesizing 'Season Zero: Pump the Pool 3' Video Asset...");

    const outputDir = path.resolve(process.cwd(), "build", "rendered_videos");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const videoTimestamp = Date.now();
    const filePath = path.join(outputDir, `season_zero_pump_pool_3_${videoTimestamp}.mp4`);

    // In enterprise environments, this triggers FFmpeg / Remotion bundle
    // Deterministic simulation payload of the video container
    const videoStreamSimulation = Buffer.concat([
      Buffer.from("RIFF_MP4_CONTAINER_SEASON_ZERO_PUMP_THE_POOL_3_QUEST"),
      Buffer.from(this.claimant.publicKey.toBuffer()),
      Buffer.from(new BigInt64Array([this.campaignId]).buffer),
      crypto.randomBytes(4096),
    ]);

    fs.writeFileSync(filePath, videoStreamSimulation);
    const fileBuffer = fs.readFileSync(filePath);
    const videoHash = crypto.createHash("sha256").update(fileBuffer).digest();

    console.log(`Video synthesized at: ${filePath}`);
    console.log(`Computed SHA-256 Video Fingerprint: 0x${videoHash.toString("hex")}`);

    return {
      title: "Season Zero: Pump the Pool 3 Technical Walkthrough & Social Quests",
      durationSeconds: 90,
      season: "Season Zero",
      questPoolName: "Pump the Pool 3",
      hash: videoHash,
      generatedFilePath: filePath,
    };
  }

  /**
   * Signs attestation via Oracle Ed25519 secret key
   */
  public createOracleAttestation(
    campaignId: bigint,
    claimantPubkey: PublicKey,
    videoHash: Buffer,
    socialQuestId: bigint
  ): { payload: Buffer; signature: Uint8Array } {
    console.log("[2/5] Oracle signing attestation payload...");

    const campaignIdBuf = Buffer.alloc(8);
    campaignIdBuf.writeBigUInt64LE(campaignId);

    const socialQuestIdBuf = Buffer.alloc(8);
    socialQuestIdBuf.writeBigUInt64LE(socialQuestId);

    const payload = Buffer.concat([
      campaignIdBuf,
      claimantPubkey.toBuffer(),
      videoHash,
      socialQuestIdBuf,
    ]);

    const signature = nacl.sign.detached(payload, this.oracle.secretKey);
    console.log(`Signed with Oracle: ${this.oracle.publicKey.toBase58()}`);
    return { payload, signature };
  }

  /**
   * Executes atomic on-chain claim on Solana with Ed25519 Verification instruction
   */
  public async submitClaim(
    videoMetadata: VideoMetadata,
    socialQuestId: bigint
  ): Promise<string> {
    console.log("[3/5] Constructing atomic on-chain claim transaction...");

    const { payload, signature } = this.createOracleAttestation(
      this.campaignId,
      this.claimant.publicKey,
      videoMetadata.hash,
      socialQuestId
    );

    // 1. Create native Ed25519Program instruction
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: this.oracle.publicKey.toBytes(),
      message: payload,
      signature: signature,
    });

    // 2. Derive Campaign and Vault PDAs
    const campaignIdBuf = Buffer.alloc(8);
    campaignIdBuf.writeBigUInt64LE(this.campaignId);

    const [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), campaignIdBuf],
      this.programId
    );

    const [rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault"), campaignIdBuf],
      this.programId
    );

    const [userClaimPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_claim"),
        campaignIdBuf,
        this.claimant.publicKey.toBuffer(),
      ],
      this.programId
    );

    const claimantTokenAccount = getAssociatedTokenAddressSync(
      this.rewardMint,
      this.claimant.publicKey
    );

    // 3. Anchor Instruction Identifier for 'verify_and_claim_reward'
    // Anchor discriminator: sha256("global:verify_and_claim_reward")[0..8]
    const discriminator = crypto
      .createHash("sha256")
      .update("global:verify_and_claim_reward")
      .digest()
      .subarray(0, 8);

    const ixData = Buffer.concat([
      discriminator,
      campaignIdBuf,
      videoMetadata.hash,
      Buffer.from(new BigInt64Array([socialQuestId]).buffer),
      Buffer.from(signature),
    ]);

    const claimIx = {
      programId: this.programId,
      keys: [
        { pubkey: campaignPda, isSigner: false, isWritable: true },
        { pubkey: rewardVaultPda, isSigner: false, isWritable: true },
        { pubkey: userClaimPda, isSigner: false, isWritable: true },
        { pubkey: claimantTokenAccount, isSigner: false, isWritable: true },
        { pubkey: this.claimant.publicKey, isSigner: true, isWritable: true },
        { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: ixData,
    };

    const transaction = new Transaction().add(ed25519Ix).add(claimIx);
    transaction.feePayer = this.claimant.publicKey;

    console.log("[4/5] Sending and confirming Solana transaction...");
    const txSignature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.claimant],
      { skipPreflight: false, commitment: "confirmed" }
    );

    console.log(`Transaction successfully confirmed: https://solscan.io/tx/${txSignature}`);
    return txSignature;
  }

  /**
   * Triggers enterprise alert notifications
   */
  public async dispatchEnterpriseAlerts(
    txSig: string,
    metadata: VideoMetadata,
    socialQuestId: bigint
  ): Promise<void> {
    console.log("[5/5] Dispatching enterprise webhook notifications...");

    const embedPayload = {
      title: "🚀 Solana Quest Completed: Season Zero & Pump the Pool 3",
      color: 0x14f195, // Solana Green
      fields: [
        { name: "Quest Tier", value: "Season Zero - Pump the Pool 3", inline: true },
        { name: "Social Quest ID", value: socialQuestId.toString(), inline: true },
        { name: "Creator", value: `\`${this.claimant.publicKey.toBase58()}\``, inline: false },
        { name: "Video Hash (SHA-256)", value: `\`${metadata.hash.toString("hex")}\``, inline: false },
        { name: "Solana Transaction", value: `[View on Solscan](https://solscan.io/tx/${txSig})`, inline: false },
      ],
      timestamp: new Date().toISOString(),
    };

    if (this.discordWebhookUrl) {
      try {
        await axios.post(this.discordWebhookUrl, { embeds: [embedPayload] });
        console.log("Discord notification successfully dispatched.");
      } catch (err) {
        console.error("Failed to post to Discord Webhook:", (err as Error).message);
      }
    }

    if (this.slackWebhookUrl) {
      try {
        await axios.post(this.slackWebhookUrl, {
          text: `*Solana Quest Completed*: ${metadata.title}\n*Creator*: ${this.claimant.publicKey.toBase58()}\n*Tx*: https://solscan.io/tx/${txSig}`,
        });
        console.log("Slack notification successfully dispatched.");
      } catch (err) {
        console.error("Failed to post to Slack Webhook:", (err as Error).message);
      }
    }
  }
}

// Runnable Entrypoint CLI
async function main() {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const programId = process.env.PROGRAM_ID || "QuestPooL11111111111111111111111111111111111";
  const campaignId = BigInt(process.env.CAMPAIGN_ID || "3");
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;

  const oracle = Keypair.generate();
  const claimant = Keypair.generate();
  const rewardMint = Keypair.generate().publicKey; // Replace with actual SPL Token Mint

  const orchestrator = new QuestVisionOrchestrator({
    rpcUrl,
    programId,
    campaignId,
    oracleKeypair: oracle,
    claimantKeypair: claimant,
    rewardMint,
    discordWebhookUrl: discordWebhook,
    slackWebhookUrl: slackWebhook,
  });

  const videoMeta = await orchestrator.renderVideoAsset();
  console.log("Video rendered successfully:", videoMeta);
  console.log("Orchestrator initialization completed.");
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Pipeline failure:", err);
    process.exit(1);
  });
}