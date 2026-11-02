import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";

describe("pump_pool_quests: Season Zero & Pump the Pool 3", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load compiled program ID
  const program = anchor.workspace.PumpPoolQuests as Program<any>;

  const admin = Keypair.generate();
  const oracle = Keypair.generate();
  const alice = Keypair.generate();
  const bob = Keypair.generate();

  let rewardMint: PublicKey;
  let campaignPda: PublicKey;
  let rewardVaultPda: PublicKey;
  let poolPda: PublicKey;
  let aliceRecordPda: PublicKey;
  let aliceRewardTokenAccount: PublicKey;

  const SEASON_ID = 0;
  const BASE_REWARD_RATE = new anchor.BN(50); // 50 tokens per SOL unit
  const INITIAL_VAULT_DEPOSIT = 10_000_000_000; // 10,000 tokens

  before(async () => {
    // Airdrop SOL to test actors
    for (const actor of [admin, oracle, alice, bob]) {
      const sig = await provider.connection.requestAirdrop(actor.publicKey, 10 * LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    // Create Reward Mint
    rewardMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    // Derive Program Addresses
    const seasonIdBuffer = Buffer.alloc(4);
    seasonIdBuffer.writeUInt32LE(SEASON_ID, 0);

    [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("season_zero"), seasonIdBuffer],
      program.programId
    );

    [rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault"), seasonIdBuffer],
      program.programId
    );

    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pump_pool_3"), seasonIdBuffer],
      program.programId
    );

    [aliceRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_quest"), campaignPda.toBuffer(), alice.publicKey.toBuffer()],
      program.programId
    );

    aliceRewardTokenAccount = await createAccount(
      provider.connection,
      alice,
      rewardMint,
      alice.publicKey
    );
  });

  it("1. Initializes Season Zero Campaign and Escrow Vault", async () => {
    const endTimestamp = new anchor.BN(Math.floor(Date.now() / 1000) + 86400 * 30);

    await program.methods
      .initializeCampaign(SEASON_ID, oracle.publicKey, endTimestamp, BASE_REWARD_RATE)
      .accounts({
        campaign: campaignPda,
        rewardVault: rewardVaultPda,
        rewardMint: rewardMint,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    // Fund Reward Vault Escrow
    await mintTo(
      provider.connection,
      admin,
      rewardMint,
      rewardVaultPda,
      admin,
      INITIAL_VAULT_DEPOSIT
    );

    const campaignState = await program.account.campaignConfig.fetch(campaignPda);
    expect(campaignState.seasonId).to.equal(SEASON_ID);
    expect(campaignState.oracleSigner.toBase58()).to.equal(oracle.publicKey.toBase58());
    expect(campaignState.isActive).to.be.true;

    const vaultAccount = await getAccount(provider.connection, rewardVaultPda);
    expect(Number(vaultAccount.amount)).to.equal(INITIAL_VAULT_DEPOSIT);
  });

  it("2. User contributes SOL into 'Pump the Pool 3'", async () => {
    const depositAmount = new anchor.BN(1 * LAMPORTS_PER_SOL); // 1.0 SOL

    await program.methods
      .pumpPoolLiquidity(depositAmount)
      .accounts({
        campaign: campaignPda,
        poolPda: poolPda,
        userRecord: aliceRecordPda,
        user: alice.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    const userRecord = await program.account.userQuestRecord.fetch(aliceRecordPda);
    expect(userRecord.user.toBase58()).to.equal(alice.publicKey.toBase58());
    expect(userRecord.depositedLiquidity.toString()).to.equal(depositAmount.toString());
    expect(userRecord.socialQuestsCompleted).to.equal(0);
  });

  it("3. Enforces Minimum Liquidity Threshold (Edge Case)", async () => {
    const subMinimalAmount = new anchor.BN(50_000_000); // 0.05 SOL (< 0.1 SOL min)

    try {
      await program.methods
        .pumpPoolLiquidity(subMinimalAmount)
        .accounts({
          campaign: campaignPda,
          poolPda: poolPda,
          userRecord: aliceRecordPda,
          user: alice.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([alice])
        .rpc();
      expect.fail("Transaction should have failed with BelowMinLiquidity");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("BelowMinLiquidity");
    }
  });

  it("4. Rejects Social Quest Verification from Unauthorized Signer (Security Check)", async () => {
    const dummyHash = Array.from(crypto.randomBytes(32));

    try {
      await program.methods
        .verifySocialQuest(0, dummyHash)
        .accounts({
          campaign: campaignPda,
          userRecord: aliceRecordPda,
          oracleSigner: bob.publicKey, // Bob is unauthorized
        })
        .signers([bob])
        .rpc();
      expect.fail("Should have failed with UnauthorizedOracle");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("UnauthorizedOracle");
    }
  });

  it("5. Oracle successfully verifies 'Make a Video' Social Quest", async () => {
    const videoUrl = "https://youtube.com/watch?v=AuraQuestSeasonZero";
    const proofHash = Array.from(crypto.createHash("sha256").update(videoUrl).digest());

    await program.methods
      .verifySocialQuest(0, proofHash) // Quest ID 0 = Video Quest
      .accounts({
        campaign: campaignPda,
        userRecord: aliceRecordPda,
        oracleSigner: oracle.publicKey,
      })
      .signers([oracle])
      .rpc();

    const userRecord = await program.account.userQuestRecord.fetch(aliceRecordPda);
    // Bit 0 must be set (1 << 0 = 1)
    expect(userRecord.socialQuestsCompleted & 1).to.equal(1);
  });

  it("6. Prevents Replay/Duplicate Attestations of the Same Quest", async () => {
    const videoUrl = "https://youtube.com/watch?v=AuraQuestSeasonZero";
    const proofHash = Array.from(crypto.createHash("sha256").update(videoUrl).digest());

    try {
      await program.methods
        .verifySocialQuest(0, proofHash)
        .accounts({
          campaign: campaignPda,
          userRecord: aliceRecordPda,
          oracleSigner: oracle.publicKey,
        })
        .signers([oracle])
        .rpc();
      expect.fail("Should have failed with QuestAlreadyCompleted");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("QuestAlreadyCompleted");
    }
  });

  it("7. User claims rewards with +25% Social Quest Multiplier applied", async () => {
    await program.methods
      .claimSeasonRewards()
      .accounts({
        campaign: campaignPda,
        userRecord: aliceRecordPda,
        rewardVault: rewardVaultPda,
        userRewardAccount: aliceRewardTokenAccount,
        user: alice.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([alice])
      .rpc();

    const userTokenBalance = await getAccount(provider.connection, aliceRewardTokenAccount);
    // Base = (1_000_000_000 / 1e6) * 50 = 50,000 units
    // Multiplier = 100 + 25 = 125% -> 50,000 * 1.25 = 62,500 units
    expect(Number(userTokenBalance.amount)).to.equal(62_500);

    const userRecord = await program.account.userQuestRecord.fetch(aliceRecordPda);
    expect(userRecord.hasClaimedRewards).to.be.true;
  });

  it("8. Rejects Double Claiming of Season Rewards", async () => {
    try {
      await program.methods
        .claimSeasonRewards()
        .accounts({
          campaign: campaignPda,
          userRecord: aliceRecordPda,
          rewardVault: rewardVaultPda,
          userRewardAccount: aliceRewardTokenAccount,
          user: alice.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([alice])
        .rpc();
      expect.fail("Should have failed with RewardAlreadyClaimed");
    } catch (err: any) {
      expect(err.error.errorCode.code).to.equal("RewardAlreadyClaimed");
    }
  });
});