import { Command } from "commander";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import * as crypto from "crypto";
import axios from "axios";
import * as fs from "fs";

const PROGRAM_ID = new PublicKey("PUMP3sEAs0nZEr0Quest11111111111111111111111");
const CAMPAIGN_SEED = Buffer.from("season_zero");
const USER_SEED = Buffer.from("user_quest");

interface WebhookPayload {
  userPubkey: string;
  questId: number;
  videoUrl: string;
  txHash: string;
  timestamp: string;
}

export class EnterpriseQuestOrchestrator {
  private connection: Connection;
  private oracleKeypair: Keypair;
  private discordWebhookUrl?: string;
  private slackWebhookUrl?: string;

  constructor(rpcUrl: string, oracleKeypairJsonPath: string, discordUrl?: string, slackUrl?: string) {
    this.connection = new Connection(rpcUrl, "confirmed");
    const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(oracleKeypairJsonPath, "utf8")));
    this.oracleKeypair = Keypair.fromSecretKey(secretKey);
    this.discordWebhookUrl = discordUrl;
    this.slackWebhookUrl = slackUrl;
  }

  public deriveCampaignPda(seasonId: number): [PublicKey, number] {
    const seasonIdBuffer = Buffer.alloc(4);
    seasonIdBuffer.writeUInt32LE(seasonId, 0);
    return PublicKey.findProgramAddressSync([CAMPAIGN_SEED, seasonIdBuffer], PROGRAM_ID);
  }

  public deriveUserRecordPda(campaignPda: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([USER_SEED, campaignPda.toBuffer(), userPubkey.toBuffer()], PROGRAM_ID);
  }

  public async notifyEnterpriseWebhooks(payload: WebhookPayload): Promise<void> {
    const discordMessage = {
      embeds: [
        {
          title: "🎉 Social Quest Verified: Season Zero",
          color: 0x14f195, // Solana Green
          fields: [
            { name: "Participant", value: `\`${payload.userPubkey}\``, inline: false },
            { name: "Quest Task", value: "Make a Video: Season Zero & Pump the Pool 3", inline: true },
            { name: "Video Proof", value: `[Watch Submission](${payload.videoUrl})`, inline: true },
            { name: "Solana Transaction", value: `\`${payload.txHash}\``, inline: false },
          ],
          footer: { text: "AuraQuest Engine • Zero Downtime Oracle" },
          timestamp: payload.timestamp,
        },
      ],
    };

    const slackMessage = {
      text: `🚀 *Quest Completed*: Participant \`${payload.userPubkey}\` verified for Video Quest! Proof: ${payload.videoUrl} | TX: ${payload.txHash}`,
    };

    if (this.discordWebhookUrl) {
      await axios.post(this.discordWebhookUrl, discordMessage).catch((e) => console.error("Discord error:", e.message));
    }
    if (this.slackWebhookUrl) {
      await axios.post(this.slackWebhookUrl, slackMessage).catch((e) => console.error("Slack error:", e.message));
    }
  }

  public async verifyAndAttestVideoQuest(
    seasonId: number,
    userPubkeyStr: string,
    videoUrl: string
  ): Promise<string> {
    const userPubkey = new PublicKey(userPubkeyStr);
    const [campaignPda] = this.deriveCampaignPda(seasonId);
    const [userRecordPda] = this.deriveUserRecordPda(campaignPda, userPubkey);

    console.log(`[Oracle] Validating video submission for user: ${userPubkey.toBase58()}`);
    console.log(`[Oracle] Content URL: ${videoUrl}`);

    // Compute deterministic SHA-256 hash of proof URL
    const proofHash = crypto.createHash("sha256").update(videoUrl).digest();

    // 8-byte Anchor discriminator for verify_social_quest
    const discriminator = Buffer.from(
      crypto.createHash("sha256").update("global:verify_social_quest").digest().slice(0, 8)
    );

    const questIdBuffer = Buffer.from([0]); // Quest 0 = Video Creation Quest
    const data = Buffer.concat([discriminator, questIdBuffer, proofHash]);

    const instruction = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: campaignPda, isSigner: false, isWritable: false },
        { pubkey: userRecordPda, isSigner: false, isWritable: true },
        { pubkey: this.oracleKeypair.publicKey, isSigner: true, isWritable: false },
      ],
      data,
    });

    const tx = new Transaction().add(instruction);
    tx.feePayer = this.oracleKeypair.publicKey;
    tx.recentBlockhash = (await this.connection.getLatestBlockhash("confirmed")).blockhash;

    tx.sign(this.oracleKeypair);
    const rawTx = tx.serialize();
    const txHash = await this.connection.sendRawTransaction(rawTx, { skipPreflight: false });
    await this.connection.confirmTransaction(txHash, "confirmed");

    console.log(`[Oracle] Attestation successful on-chain. TX: ${txHash}`);

    await this.notifyEnterpriseWebhooks({
      userPubkey: userPubkey.toBase58(),
      questId: 0,
      videoUrl,
      txHash,
      timestamp: new Date().toISOString(),
    });

    return txHash;
  }
}

// -----------------------------------------------------------------------------
// CLI COMMAND DEFINITIONS
// -----------------------------------------------------------------------------
const program = new Command();
program.name("auraquest-cli").description("Enterprise Season Zero & Pump the Pool 3 CLI").version("1.0.0");

program
  .command("verify-video")
  .description("Attest and verify a user video quest submission")
  .requiredOption("-s, --season <number>", "Season ID (e.g., 0)", "0")
  .requiredOption("-u, --user <pubkey>", "User Solana Public Key")
  .requiredOption("-v, --video-url <url>", "Public link to submitted video (YouTube/X/TikTok)")
  .requiredOption("-k, --keypair <path>", "Oracle keypair path")
  .option("-r, --rpc <url>", "Solana RPC URL", "https://api.devnet.solana.com")
  .option("--discord <url>", "Discord Webhook URL")
  .option("--slack <url>", "Slack Webhook URL")
  .action(async (opts) => {
    try {
      const orchestrator = new EnterpriseQuestOrchestrator(opts.rpc, opts.keypair, opts.discord, opts.slack);
      const tx = await orchestrator.verifyAndAttestVideoQuest(parseInt(opts.season), opts.user, opts.videoUrl);
      console.log(`\n✅ Video Quest Verified & Attested Successfully! TX: ${tx}\n`);
    } catch (err: any) {
      console.error("\n❌ Attestation failed:", err.message);
      process.exit(1);
    }
  });

if (require.main === module) {
  program.parse(process.argv);
}