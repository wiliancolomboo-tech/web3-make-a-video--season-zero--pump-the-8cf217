// tests/pump_the_pool_quests.ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PumpThePoolQuests } from "../target/types/pump_the_pool_quests";
import { Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { SeasonZeroOrchestrator } from "../src/orchestrator";
import { DynamicVideoEngine } from "../src/render_engine";
import { expect } from "chai";

describe("Season Zero: Pump the Pool 3 & Social Quests QA Matrix", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PumpThePoolQuests as Program<PumpThePoolQuests>;
  const oracleKeypair = Keypair.generate();
  const userKeypair = Keypair.generate();
  const seasonId = 101;
  const minLpLamports = new anchor.BN(1_000_000_000); // 1.0 SOL

  let campaignPda: PublicKey;
  let userRecordPda: PublicKey;
  let orchestrator: SeasonZeroOrchestrator;

  before(async () => {
    // Airdrop SOL to test participants
    const sig1 = await provider.connection.requestAirdrop(userKeypair.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig1);

    [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_season"), new anchor.BN(seasonId).toArrayLike(Buffer, "le", 4)],
      program.programId
    );

    [userRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_quest"), userKeypair.publicKey.toBuffer(), campaignPda.toBuffer()],
      program.programId
    );

    orchestrator = new SeasonZeroOrchestrator({
      rpcUrl: provider.connection.rpcEndpoint,
      oracleKeypair: oracleKeypair,
    });
  });

  it("1. Successfully initializes Season Zero campaign instance", async () => {
    const futureTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 30);

    await program.methods
      .initializeCampaign(
        seasonId,
        Array.from(oracleKeypair.publicKey.toBytes()),
        minLpLamports,
        futureTimestamp
      )
      .accounts({
        campaign: campaignPda,
        admin: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const campaignState = await program.account.campaignState.fetch(campaignPda);
    expect(campaignState.seasonId).to.equal(seasonId);
    expect(campaignState.isActive).to.be.true;
    expect(campaignState.totalParticipants.toNumber()).to.equal(0);
  });

  it("2. Validates Ed25519 signature and claims quest with dynamic pool liquidity", async () => {
    const questBit = 0; // Quest 0: "Retweet & Follow Campaign"
    const lpAmount = BigInt(2_500_000_000); // 2.5 SOL in DLMM pool
    const xpReward = new anchor.BN(500);

    const { ed25519Ix, signature } = await orchestrator.generateQuestAttestation(
      userKeypair.publicKey,
      questBit,
      lpAmount
    );

    const claimIx = await program.methods
      .claimQuestWithLpProof(
        questBit,
        new anchor.BN(lpAmount.toString()),
        xpReward,
        Array.from(signature)
      )
      .accounts({
        campaign: campaignPda,
        userRecord: userRecordPda,
        user: userKeypair.publicKey,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);
    const txSig = await provider.sendAndConfirm(tx, [userKeypair]);
    expect(txSig).to.be.a("string");

    const record = await program.account.userQuestRecord.fetch(userRecordPda);
    expect(record.completedQuestsMask).to.equal(1 << questBit);
    expect(record.xpBalance.toNumber()).to.equal(500);
  });

  it("3. Rejects duplicate claims for the same quest bit (Double Spend Protection)", async () => {
    const questBit = 0;
    const lpAmount = BigInt(2_500_000_000);
    const xpReward = new anchor.BN(500);

    const { ed25519Ix, signature } = await orchestrator.generateQuestAttestation(
      userKeypair.publicKey,
      questBit,
      lpAmount
    );

    const claimIx = await program.methods
      .claimQuestWithLpProof(
        questBit,
        new anchor.BN(lpAmount.toString()),
        xpReward,
        Array.from(signature)
      )
      .accounts({
        campaign: campaignPda,
        userRecord: userRecordPda,
        user: userKeypair.publicKey,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);
    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have failed with QuestAlreadyCompleted");
    } catch (err: any) {
      expect(err.message).to.include("QuestAlreadyCompleted");
    }
  });

  it("4. Rejects claims with insufficient Pump the Pool 3 LP liquidity", async () => {
    const questBit = 1;
    const lowLp = BigInt(500_000_000); // 0.5 SOL < min 1.0 SOL
    const xpReward = new anchor.BN(250);

    const { ed25519Ix, signature } = await orchestrator.generateQuestAttestation(
      userKeypair.publicKey,
      questBit,
      lowLp
    );

    const claimIx = await program.methods
      .claimQuestWithLpProof(
        questBit,
        new anchor.BN(lowLp.toString()),
        xpReward,
        Array.from(signature)
      )
      .accounts({
        campaign: campaignPda,
        userRecord: userRecordPda,
        user: userKeypair.publicKey,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);
    try {
      await provider.sendAndConfirm(tx, [userKeypair]);
      expect.fail("Should have failed with InsufficientLpLiquidity");
    } catch (err: any) {
      expect(err.message).to.include("InsufficientLpLiquidity");
    }
  });

  it("5. End-to-end triggers video synthesis engine for verified participant", async () => {
    const videoEngine = new DynamicVideoEngine("/tmp/test_renders");
    const videoPath = await videoEngine.renderVideo({
      userPubkey: userKeypair.publicKey.toBase58(),
      seasonId: seasonId,
      lpAmountLamports: BigInt(2_500_000_000),
      totalXp: 500,
      completedQuests: ["Follow X", "Deposit DLMM", "Discord Role"],
      txSignature: "5K2Xy...PumpPool3SimulatedTx",
    });

    expect(videoPath).to.be.a("string");
    expect(videoPath.endsWith(".mp4")).to.be.true;
  });
});