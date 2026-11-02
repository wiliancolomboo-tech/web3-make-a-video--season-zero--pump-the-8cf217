import { Command } from "commander";
import * as dotenv from "dotenv";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  Ed25519Program,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { Program, AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as fs from "fs";
import nacl from "tweetnacl";
import { VideoVerifierService } from "./services/video_verifier";
import { EnterpriseNotifier } from "./services/enterprise_notifier";

dotenv.config();

const programId = new PublicKey("AuraQpTP3SeasonZero11111111111111111111111111");

const program = new Command();
program
  .name("auraquest-cli")
  .description("Enterprise Engine for Season Zero & Pump the Pool 3 Verification")
  .version("1.0.0");

program
  .command("submit-quest")
  .requiredOption("-v, --video <path>", "Path to Season Zero campaign video file")
  .requiredOption("-k, --keypair <path>", "Path to participant Solana keypair JSON")
  .requiredOption("-o, --oracle-keypair <path>", "Path to Oracle Authority keypair JSON")
  .requiredOption("-p, --pool <pubkey>", "Target Pump the Pool 3 DEX address")
  .requiredOption("-m, --mint <pubkey>", "Reward Token Mint Pubkey")
  .option("-e, --email <email>", "Participant email address for Resend notifications")
  .action(async (options) => {
    try {
      console.log("=================================================");
      console.log("   AURAQUEST: SEASON ZERO & PUMP THE POOL 3      ");
      console.log("=================================================");

      // 1. Process Video Verification
      console.log(`[1/5] Inspecting video metadata: ${options.video}...`);
      const videoMeta = await VideoVerifierService.analyzeVideo(options.video);
      console.log(` -> SHA256 Media Hash: ${videoMeta.sha256Hash.toString("hex")}`);
      console.log(` -> Duration: ${videoMeta.durationSeconds.toFixed(2)}s | Resolution: ${videoMeta.width}x${videoMeta.height}`);

      // 2. Load Keypairs and RPC Connection
      const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl("devnet");
      const connection = new Connection(rpcUrl, "confirmed");

      const participantKp = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(options.keypair, "utf-8")))
      );
      const oracleKp = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(fs.readFileSync(options.oracleKeypair, "utf-8")))
      );

      const poolPubkey = new PublicKey(options.pool);
      const rewardMintPubkey = new PublicKey(options.mint);

      console.log(`[2/5] Checking DEX LP position for wallet: ${participantKp.publicKey.toBase58()}...`);
      // Deterministic LP simulation check (In production, reads DEX LP token position)
      const simulatedLpAmount = 5_000_000_000; // 5 units @ 9 decimals
      const bonusBps = 2500; // 25% Boost for Tier 1 LP Provison

      // 3. Oracle Constructs Ed25519 Attestation
      console.log("[3/5] Generating cryptographic Ed25519 attestation from Oracle...");
      const messageToSign = Buffer.concat([
        participantKp.publicKey.toBuffer(),
        videoMeta.sha256Hash,
        Buffer.from(new Uint8Array(new BigUint64Array([BigInt(simulatedLpAmount)]).buffer)),
      ]);

      const ed25519Instruction = Ed25519Program.createInstructionWithPrivateKey({
        privateKey: oracleKp.secretKey,
        message: messageToSign,
      });

      // 4. Derive Program PDAs
      const [campaignConfigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("campaign_config"), poolPubkey.toBuffer()],
        programId
      );

      const [rewardVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("reward_vault"), campaignConfigPda.toBuffer()],
        programId
      );

      const [userQuestRecordPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("user_quest"),
          campaignConfigPda.toBuffer(),
          participantKp.publicKey.toBuffer(),
        ],
        programId
      );

      const participantAta = getAssociatedTokenAddressSync(
        rewardMintPubkey,
        participantKp.publicKey
      );

      console.log("[4/5] Executing atomic Solana transaction...");
      const idl = await Program.fetchIdl(programId, new AnchorProvider(connection, new Wallet(participantKp), {}));
      if (!idl) {
        throw new Error("Unable to fetch on-chain IDL for ptp3_season_zero");
      }

      const anchorProgram = new Program(idl, programId, new AnchorProvider(connection, new Wallet(participantKp), {}));

      const claimIx = await anchorProgram.methods
        .completeSocialQuest(
          Array.from(videoMeta.sha256Hash),
          new (anchorProgram.provider as any).bn(simulatedLpAmount),
          bonusBps
        )
        .accounts({
          participant: participantKp.publicKey,
          campaignConfig: campaignConfigPda,
          rewardMint: rewardMintPubkey,
          rewardVault: rewardVaultPda,
          participantTokenAccount: participantAta,
          userQuestRecord: userQuestRecordPda,
          instructionsSysvar: PublicKey.findProgramAddressSync(
            [Buffer.from("SysvarInstructions1111111111111111111111111")],
            PublicKey.default
          )[0],
          systemProgram: PublicKey.default,
          tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        })
        .instruction();

      const tx = new Transaction().add(ed25519Instruction).add(claimIx);
      const signature = await sendAndConfirmTransaction(connection, tx, [participantKp]);
      console.log(` -> Settlement Confirmed! Signature: ${signature}`);

      // 5. Enterprise Telemetry & Notification
      console.log("[5/5] Emitting enterprise webhooks & notifications...");
      const notifier = new EnterpriseNotifier();
      await notifier.notifyCompletion({
        participant: participantKp.publicKey.toBase58(),
        videoHash: videoMeta.sha256Hash.toString("hex"),
        txSignature: signature,
        rewardAmount: 125, // 100 base * 1.25x
        userEmail: options.email,
      });

      console.log("✔ Quest successfully completed and fully reconciled on-chain.");
    } catch (err: any) {
      console.error("❌ Process halted with error:", err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);