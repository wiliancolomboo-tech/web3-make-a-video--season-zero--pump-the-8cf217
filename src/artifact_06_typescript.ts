import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PumpQuestPool } from "../target/types/pump_quest_pool";
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
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import * as crypto from "crypto";
import * as nacl from "tweetnacl";

describe("pump_quest_pool contract suite", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PumpQuestPool as Program<PumpQuestPool>;

  const admin = (provider.wallet as any).payer as Keypair;
  const oracle = Keypair.generate();
  const claimant = Keypair.generate();
  const attacker = Keypair.generate();

  let rewardMint: PublicKey;
  let campaignPda: PublicKey;
  let rewardVaultPda: PublicKey;

  const campaignId = new anchor.BN(3); // Season Zero, Pump the Pool 3
  const rewardPerClaim = new anchor.BN(100_000_000); // 100 Reward Tokens (e.g., 6 decimals)
  const maxClaims = new anchor.BN(10);
  const socialQuestId = new anchor.BN(101);

  const videoHash = crypto.createHash("sha256").update("season_zero_pool_3_demo_video").digest();

  before(async () => {
    // 1. Airdrop SOL to test participants
    const airdropClaimant = await provider.connection.requestAirdrop(
      claimant.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropClaimant);

    const airdropAttacker = await provider.connection.requestAirdrop(
      attacker.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropAttacker);

    // 2. Setup Reward Mint & Vault
    rewardMint = await createMint(
      provider.connection,
      admin,
      admin.publicKey,
      null,
      6
    );

    const campaignIdBuf = campaignId.toArrayLike(Buffer, "le", 8);
    [campaignPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign"), campaignIdBuf],
      program.programId
    );

    [rewardVaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("campaign_vault"), campaignIdBuf],
      program.programId
    );

    // Initialize Campaign
    await program.methods
      .initializeCampaign(campaignId, rewardPerClaim, maxClaims, oracle.publicKey)
      .accounts({
        campaign: campaignPda,
        rewardMint: rewardMint,
        rewardVault: rewardVaultPda,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([admin])
      .rpc();

    // Fund the campaign vault
    await mintTo(
      provider.connection,
      admin,
      rewardMint,
      rewardVaultPda,
      admin.publicKey,
      10_000_000_000 // 10,000 tokens
    );
  });

  it("1. Successfully executes valid video & social quest reward claim with ed25519 signature", async () => {
    const claimantTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      claimant,
      rewardMint,
      claimant.publicKey
    );

    const [userClaimPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_claim"),
        campaignId.toArrayLike(Buffer, "le", 8),
        claimant.publicKey.toBuffer(),
      ],
      program.programId
    );

    // Construct Attestation Payload
    const campaignIdBuf = campaignId.toArrayLike(Buffer, "le", 8);
    const socialQuestIdBuf = socialQuestId.toArrayLike(Buffer, "le", 8);
    const message = Buffer.concat([
      campaignIdBuf,
      claimant.publicKey.toBuffer(),
      videoHash,
      socialQuestIdBuf,
    ]);

    const sig = nacl.sign.detached(message, oracle.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: message,
      signature: sig,
    });

    const claimIx = await program.methods
      .verifyAndClaimReward(
        campaignId,
        Array.from(videoHash) as any,
        socialQuestId,
        Array.from(sig) as any
      )
      .accounts({
        campaign: campaignPda,
        rewardVault: rewardVaultPda,
        userClaim: userClaimPda,
        claimantTokenAccount: claimantTokenAccount,
        claimant: claimant.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);

    await provider.sendAndConfirm(tx, [claimant]);

    // Assert claimant received exactly rewardPerClaim
    const userAtaBalance = await getAccount(provider.connection, claimantTokenAccount);
    expect(userAtaBalance.amount.toString()).to.equal(rewardPerClaim.toString());

    // Assert UserClaim state was written
    const claimState = await program.account.userClaim.fetch(userClaimPda);
    expect(claimState.claimant.toBase58()).to.equal(claimant.publicKey.toBase58());
    expect(claimState.rewardAmount.toString()).to.equal(rewardPerClaim.toString());
  });

  it("2. Rejects duplicate claim replay attack for the same claimant", async () => {
    const claimantTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      admin,
      rewardMint,
      claimant.publicKey
    ).catch(() => null); // ATA already exists

    const [userClaimPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_claim"),
        campaignId.toArrayLike(Buffer, "le", 8),
        claimant.publicKey.toBuffer(),
      ],
      program.programId
    );

    const message = Buffer.concat([
      campaignId.toArrayLike(Buffer, "le", 8),
      claimant.publicKey.toBuffer(),
      videoHash,
      socialQuestId.toArrayLike(Buffer, "le", 8),
    ]);
    const sig = nacl.sign.detached(message, oracle.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message: message,
      signature: sig,
    });

    const ata = await anchor.utils.token.associatedAddress({
      mint: rewardMint,
      owner: claimant.publicKey,
    });

    const claimIx = await program.methods
      .verifyAndClaimReward(
        campaignId,
        Array.from(videoHash) as any,
        socialQuestId,
        Array.from(sig) as any
      )
      .accounts({
        campaign: campaignPda,
        rewardVault: rewardVaultPda,
        userClaim: userClaimPda,
        claimantTokenAccount: ata,
        claimant: claimant.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);

    try {
      await provider.sendAndConfirm(tx, [claimant]);
      expect.fail("Expected transaction to fail due to duplicate account initialization");
    } catch (err: any) {
      // Re-initialization of user_claim PDA is prevented by Anchor's `init` constraint
      expect(err.toString()).to.include("already in use");
    }
  });

  it("3. Rejects claim when oracle signature is forged by attacker", async () => {
    const fakeOracle = Keypair.generate();
    const attackerAta = await createAssociatedTokenAccount(
      provider.connection,
      attacker,
      rewardMint,
      attacker.publicKey
    );

    const [attackerClaimPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("user_claim"),
        campaignId.toArrayLike(Buffer, "le", 8),
        attacker.publicKey.toBuffer(),
      ],
      program.programId
    );

    const message = Buffer.concat([
      campaignId.toArrayLike(Buffer, "le", 8),
      attacker.publicKey.toBuffer(),
      videoHash,
      socialQuestId.toArrayLike(Buffer, "le", 8),
    ]);
    const fakeSig = nacl.sign.detached(message, fakeOracle.secretKey);

    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: fakeOracle.publicKey.toBytes(),
      message: message,
      signature: fakeSig,
    });

    const claimIx = await program.methods
      .verifyAndClaimReward(
        campaignId,
        Array.from(videoHash) as any,
        socialQuestId,
        Array.from(fakeSig) as any
      )
      .accounts({
        campaign: campaignPda,
        rewardVault: rewardVaultPda,
        userClaim: attackerClaimPda,
        claimantTokenAccount: attackerAta,
        claimant: attacker.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();

    const tx = new anchor.web3.Transaction().add(ed25519Ix).add(claimIx);

    try {
      await provider.sendAndConfirm(tx, [attacker]);
      expect.fail("Expected transaction to fail with OraclePubkeyMismatch");
    } catch (err: any) {
      expect(err.toString()).to.include("OraclePubkeyMismatch");
    }
  });
});