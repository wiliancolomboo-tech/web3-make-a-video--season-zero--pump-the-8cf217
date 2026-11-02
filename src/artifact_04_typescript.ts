import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { QuestStream } from "../target/types/quest_stream";
import {
  Keypair,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import crypto from "crypto";
import nacl from "tweetnacl";

describe("quest_stream unit & integration test matrix", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.QuestStream as Program<QuestStream>;

  const oracle = Keypair.generate();
  const creator = Keypair.generate();

  let lpMint: PublicKey;
  let rewardMint: PublicKey;
  let userLpAccount: PublicKey;
  let userRewardAccount: PublicKey;

  let campaignPda: PublicKey;
  let campaignBump: number;
  let rewardVaultPda: PublicKey;
  let poolVaultPda: PublicKey;
  let userAccountPda: PublicKey;

  const minLpAmount = new anchor.BN(1_000_000);
  const rewardPerVideo = new anchor.BN(50_000_000);
  const rewardPerLpUnit = new anchor.BN(2);
  const duration = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

  before(async () => {
    // Airdrop SOL
    const sig1 = await provider.connection.requestAirdrop(creator.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const sig2 = await provider.connection.requestAirdrop(oracle.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig1);
    await provider.connection.confirmTransaction(sig2);

    // Create SPL tokens
    const payer = (provider.wallet as any).payer;
    lpMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);
    rewardMint = await createMint(provider.connection, payer, payer.publicKey, null, 6);

    // Derive PDAs
    [campaignPda, campaignBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("season_zero"), lpMint.toBuffer()],
      program.programId
    );

    [rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("reward_vault"), campaignPda.toBuffer()],
      program.programId
    );

    [poolVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("lp_pool_vault"), campaignPda.toBuffer()],
      program.programId
    );

    [userAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_quest"), campaignPda.toBuffer(), creator.publicKey.toBuffer()],
      program.programId
    );

    // Setup Token Accounts
    userLpAccount = await createAccount(provider.connection, creator, lpMint, creator.publicKey);
    userRewardAccount = await createAccount(provider.connection, creator, rewardMint, creator.publicKey);

    // Mint test LP to user
    await mintTo(provider.connection, payer, lpMint, userLpAccount, payer.publicKey, 10_000_000);
  });

  it("1. Successfully initializes Campaign Configuration and Reward Vault", async () => {
    await program.methods
      .initializeCampaign(
        oracle.publicKey,
        minLpAmount,
        rewardPerVideo,
        rewardPerLpUnit,
        duration
      )
      .accounts({
        campaign: campaignPda,
        lpMint: lpMint,
        rewardMint: rewardMint,
        rewardVault: rewardVaultPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    // Fund Reward Vault with 500 tokens
    const payer = (provider.wallet as any).payer;
    await mintTo(provider.connection, payer, rewardMint, rewardVaultPda, payer.publicKey, 500_000_000);

    const campaignState = await program.account.campaignConfig.fetch(campaignPda);
    expect(campaignState.oracle.toBase58()).to.equal(oracle.publicKey.toBase58());
    expect(campaignState.minLpAmount.toNumber()).to.equal(minLpAmount.toNumber());
  });

  it("2. Registers User Account for Season Zero", async () => {
    await program.methods
      .initializeUser()
      .accounts({
        userAccount: userAccountPda,
        campaign: campaignPda,
        user: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const userState = await program.account.userAccount.fetch(userAccountPda);
    expect(userState.user.toBase58()).to.equal(creator.publicKey.toBase58());
    expect(userState.videoQuestsCompleted).to.equal(0);
    expect(userState.lpStaked.toNumber()).to.equal(0);
  });

  it("3. Verifies Video Quest submission with valid Oracle Ed25519 signature", async () => {
    const rawVideoHash = crypto.createHash("sha256").update("season_zero_video_content_id_101").digest();
    const platformId = 1; // YouTube

    const message = Buffer.concat([
      creator.publicKey.toBuffer(),
      rawVideoHash,
      Buffer.from([platformId]),
    ]);
    const signature = nacl.sign.detached(message, oracle.secretKey);

    const [videoProofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("video_proof"), campaignPda.toBuffer(), rawVideoHash],
      program.programId
    );

    await program.methods
      .verifyVideoQuest(
        Array.from(rawVideoHash),
        platformId,
        Array.from(signature)
      )
      .accounts({
        campaign: campaignPda,
        userAccount: userAccountPda,
        videoProof: videoProofPda,
        user: creator.publicKey,
        instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .signers([creator])
      .rpc();

    const userState = await program.account.userAccount.fetch(userAccountPda);
    expect(userState.videoQuestsCompleted).to.equal(1);

    const proofState = await program.account.videoProof.fetch(videoProofPda);
    expect(proofState.submitter.toBase58()).to.equal(creator.publicKey.toBase58());
  });

  it("4. Prevents duplicate submission of the same video content (Sybil Protection)", async () => {
    const rawVideoHash = crypto.createHash("sha256").update("season_zero_video_content_id_101").digest();
    const platformId = 1;

    const message = Buffer.concat([
      creator.publicKey.toBuffer(),
      rawVideoHash,
      Buffer.from([platformId]),
    ]);
    const signature = nacl.sign.detached(message, oracle.secretKey);

    const [videoProofPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("video_proof"), campaignPda.toBuffer(), rawVideoHash],
      program.programId
    );

    try {
      await program.methods
        .verifyVideoQuest(
          Array.from(rawVideoHash),
          platformId,
          Array.from(signature)
        )
        .accounts({
          campaign: campaignPda,
          userAccount: userAccountPda,
          videoProof: videoProofPda,
          user: creator.publicKey,
          instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .signers([creator])
        .rpc();
      assert.fail("Should have thrown error on duplicated video hash");
    } catch (err: any) {
      expect(err.toString()).to.include("already in use");
    }
  });

  it("5. Locks LP tokens into 'Pump the Pool 3' Vault", async () => {
    const lockAmount = new anchor.BN(2_000_000);

    await program.methods
      .lockPoolLiquidity(lockAmount)
      .accounts({
        campaign: campaignPda,
        userAccount: userAccountPda,
        userLpTokenAccount: userLpAccount,
        poolVault: poolVaultPda,
        lpMint: lpMint,
        user: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([creator])
      .rpc();

    const userState = await program.account.userAccount.fetch(userAccountPda);
    expect(userState.lpStaked.toNumber()).to.equal(2_000_000);

    const vaultBalance = await getAccount(provider.connection, poolVaultPda);
    expect(Number(vaultBalance.amount)).to.equal(2_000_000);
  });

  it("6. Claims accumulated rewards and checks arithmetic precision", async () => {
    // Expected: 1 video (50_000_000) + 2_000_000 LP * 2 = 54_000_000
    await program.methods
      .claimRewards()
      .accounts({
        campaign: campaignPda,
        userAccount: userAccountPda,
        rewardVault: rewardVaultPda,
        userRewardTokenAccount: userRewardAccount,
        user: creator.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const userRewardState = await getAccount(provider.connection, userRewardAccount);
    expect(Number(userRewardState.amount)).to.equal(54_000_000);

    const userState = await program.account.userAccount.fetch(userAccountPda);
    expect(userState.rewardsClaimed.toNumber()).to.equal(54_000_000);
  });
});