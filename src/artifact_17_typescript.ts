import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { CONFIG } from "./config";

export class QuestOracleAttestor {
  private oracleKeypair: Keypair;

  constructor(secretKeyHex?: string) {
    if (secretKeyHex) {
      const secretBytes = Buffer.from(secretKeyHex, "hex");
      this.oracleKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      this.oracleKeypair = Keypair.generate();
    }
  }

  public getPublicKey(): PublicKey {
    return this.oracleKeypair.publicKey;
  }

  /**
   * Constructs the deterministic 40-byte payload:
   * [User Pubkey (32 bytes)] + [Quest ID (4 bytes LE)] + [Season ID (4 bytes LE)]
   */
  public generateSignedAttestation(userPubkey: PublicKey, questId: number, seasonId: number): {
    payload: Buffer;
    signature: Uint8Array;
  } {
    const payload = Buffer.alloc(40);
    userPubkey.toBuffer().copy(payload, 0);
    payload.writeUInt32LE(questId, 32);
    payload.writeUInt32LE(seasonId, 36);

    const signature = nacl.sign.detached(payload, this.oracleKeypair.secretKey);
    return { payload, signature };
  }

  /**
   * Mock verifier for social platforms (Twitter/X API & Discord OAuth2)
   */
  public async verifySocialAction(platform: "twitter" | "discord", handle: string, expectedActionId: string): Promise<boolean> {
    // In production, invoke X API v2 (GET /2/tweets/:id/retweeted_by) or Discord Guild Audit API
    console.log(`[Oracle] Verifying platform=${platform} handle=${handle} for action=${expectedActionId}`);
    return true;
  }
}