import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SeasonZeroCore } from "../target/types/season_zero_core";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  Ed25519Program,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import nacl from "tweetnacl";

describe("season-zero-core e2e test suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SeasonZeroCore as Program<SeasonZeroCore>;

  const authority = Keypair.generate();
  const oracleAuthority = Keypair.generate();
  const user = Keypair.generate();
  const seasonId = 0;

  let pool3Mint: PublicKey;
  let userTokenAccount: PublicKey;
  let seasonConfigPda: PublicKey;
  let pool3VaultPda: PublicKey;
  let userProfilePda: PublicKey;

  before(async () => {
    // Airdrop SOL to test participants
    const airdropSig1 = await provider.connection.requestAirdrop(authority.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const airdropSig2 = await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(airdropSig1);
    await provider.connection.confirmTransaction(airdropSig2);

    // Create Pool 3 LP Mint
    pool3Mint = await createMint(
      provider.connection,
      authority,
      authority.publicKey,
      null,
      6
    );

    // Derive Program PDAs
    const seasonIdBuffer = Buffer.alloc(4);
    seasonIdBuffer.writeUInt32LE(seasonId, 0);

    [seasonConfigPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("global_season_config"), seasonIdBuffer],
      program.programId
    );

    [pool3VaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool_3_vault"), seasonIdBuffer],
      program.programId
    );

    [userProfilePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_season_profile"), seasonIdBuffer, user.publicKey.toBuffer()],
      program.programId
    );

    // Create user token account and mint 5,000 LP tokens
    userTokenAccount = await createAccount(
      provider.connection,
      user,
      pool3Mint,
      user.publicKey
    );

    await mintTo(
      provider.connection,
      authority,
      pool3Mint,
      userTokenAccount,
      authority,
      5000 * 10 ** 6
    );
  });

  it("1. Initializes Season Zero global configuration and Pool 3 escrow vault", async () => {
    const baseMultiplierBps = 1500; // 1.5x multiplier

    await program.methods
      .initializeSeason(seasonId, oracleAuthority.publicKey, baseMultiplierBps)
      .accounts({
        authority: authority.publicKey,
        seasonConfig: seasonConfigPda,
        pool3Mint: pool3Mint,
        pool3Vault: pool3VaultPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    const config = await program.account.seasonConfig.fetch(seasonConfigPda);
    expect(config.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(config.oracleAuthority.toBase58()).to.equal(oracleAuthority.publicKey.toBase58());
    expect(config.seasonId).to.equal(seasonId);
    expect(config.isActive).to.be.true;
    expect(config.totalPool3Liquidity.toNumber()).to.equal(0);
  });

  it("2. Registers user profile for Season Zero", async () => {
    await program.methods
      .initializeUser(seasonId)
      .accounts({
        user: user.publicKey,
        seasonConfig: seasonConfigPda,
        userProfile: userProfilePda,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const profile = await program.account.userProfile.fetch(userProfilePda);
    expect(profile.user.toBase58()).to.equal(user.publicKey.toBase58());
    expect(profile.pool3Staked.toNumber()).to.equal(0);
    expect(profile.questPoints.toNumber()).to.equal(0);
    expect(profile.questsCompletedMask.toNumber()).to.equal(0);
  });

  it("3. Executes 'Pump the Pool 3' LP deposit into the vault", async () => {
    const depositAmount = new anchor.BN(1000 * 10 ** 6);

    await program.methods
      .pumpPool(seasonId, depositAmount)
      .accounts({
        user: user.publicKey,
        seasonConfig: seasonConfigPda,
        userProfile: userProfilePda,
        pool3Mint: pool3Mint,
        userTokenAccount: userTokenAccount,
        pool3Vault: pool3VaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const profile = await program.account.userProfile.fetch(userProfilePda);
    expect(profile.pool3Staked.toNumber()).to.equal(depositAmount.toNumber());

    const vaultAccount = await getAccount(provider.connection, pool3VaultPda);
    expect(Number(vaultAccount.amount)).to.equal(depositAmount.toNumber());
  });

  it("4. Verifies Social Quest with Ed25519 Oracle attestation", async () => {
    const questId = 2; // e.g., Quest 2: Twitter Repost & Tag
    const points = new anchor.BN(250);

    // Prepare message payload: user (32) + quest_id (4) + season_id (4)
    const payload = Buffer.alloc(40);
    user.publicKey.toBuffer().copy(payload, 0);
    payload.writeUInt32LE(questId, 32);
    payload.writeUInt32LE(seasonId, 36);

    const signature = nacl.sign.detached(payload, oracleAuthority.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracleAuthority.publicKey.toBytes(),
      message: payload,
      signature: signature,
    });

    const questIdBuffer = Buffer.alloc(4);
    questIdBuffer.writeUInt32LE(questId, 0);
    const seasonIdBuffer = Buffer.alloc(4);
    seasonIdBuffer.writeUInt32LE(seasonId, 0);

    const [questReceiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("quest_receipt"), seasonIdBuffer, questIdBuffer, user.publicKey.toBuffer()],
      program.programId
    );

    const verifyIx = await program.methods
      .verifySocialQuest(seasonId, questId, points)
      .accounts({
        user: user.publicKey,
        seasonConfig: seasonConfigPda,
        userProfile: userProfilePda,
        questReceipt: questReceiptPda,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(verifyIx);
    await provider.sendAndConfirm(tx, [user]);

    const profile = await program.account.userProfile.fetch(userProfilePda);
    expect(profile.questPoints.toNumber()).to.equal(250);
    // Bitmask check: 1 << 2 = 4
    expect(profile.questsCompletedMask.toNumber()).to.equal(4);
  });

  it("5. Rejects duplicate Social Quest claim (Anti-Sybil Replay Guard)", async () => {
    const questId = 2;
    const points = new anchor.BN(250);

    const payload = Buffer.alloc(40);
    user.publicKey.toBuffer().copy(payload, 0);
    payload.writeUInt32LE(questId, 32);
    payload.writeUInt32LE(seasonId, 36);

    const signature = nacl.sign.detached(payload, oracleAuthority.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracleAuthority.publicKey.toBytes(),
      message: payload,
      signature: signature,
    });

    const questIdBuffer = Buffer.alloc(4);
    questIdBuffer.writeUInt32LE(questId, 0);
    const seasonIdBuffer = Buffer.alloc(4);
    seasonIdBuffer.writeUInt32LE(seasonId, 0);

    const [questReceiptPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("quest_receipt"), seasonIdBuffer, questIdBuffer, user.publicKey.toBuffer()],
      program.programId
    );

    const verifyIx = await program.methods
      .verifySocialQuest(seasonId, questId, points)
      .accounts({
        user: user.publicKey,
        seasonConfig: seasonConfigPda,
        userProfile: userProfilePda,
        questReceipt: questReceiptPda,
        sysvarInstructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(verifyIx);

    try {
      await provider.sendAndConfirm(tx, [user]);
      expect.fail("Should have failed on duplicate quest claim");
    } catch (err: any) {
      expect(err.message).to.include("QuestAlreadyClaimed");
    }
  });
});