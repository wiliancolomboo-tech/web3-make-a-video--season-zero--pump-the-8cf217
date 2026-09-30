// src/render_engine.ts
import { createCanvas } from "canvas";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";

export interface VideoMetadata {
  userPubkey: string;
  seasonId: number;
  lpAmountLamports: bigint;
  totalXp: number;
  completedQuests: string[];
  txSignature: string;
}

export class DynamicVideoEngine {
  private width: number = 1280;
  private height: number = 720;
  private fps: number = 30;
  private durationSeconds: number = 5;

  constructor(private outputDir: string = "/tmp/season_zero_renders") {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Generates a dynamic 60fps/30fps MP4 video presenting Season Zero & Pump the Pool 3 stats
   */
  public async renderVideo(meta: VideoMetadata): Promise<string> {
    const totalFrames = this.fps * this.durationSeconds;
    const sessionDir = path.join(this.outputDir, `render_${Date.now()}_${meta.userPubkey.slice(0, 8)}`);
    fs.mkdirSync(sessionDir, { recursive: true });

    console.log(`[VideoEngine] Generating ${totalFrames} frames for ${meta.userPubkey}`);

    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext("2d");

    // Synthesize frames
    for (let frame = 0; frame < totalFrames; frame++) {
      const progress = frame / totalFrames;
      this.drawFrame(ctx, meta, progress, frame);
      const frameBuffer = canvas.toBuffer("image/jpeg", { quality: 0.95 });
      const frameFileName = path.join(sessionDir, `frame_${String(frame).padStart(4, "0")}.jpg`);
      fs.writeFileSync(frameFileName, frameBuffer);
    }

    const outputMp4 = path.join(this.outputDir, `season_zero_${meta.userPubkey.slice(0, 8)}.mp4`);

    // Compile into H.264 MP4 using FFmpeg
    await this.compileFFmpeg(sessionDir, outputMp4);

    // Clean up temporary frame directory
    fs.rmSync(sessionDir, { recursive: true, force: true });
    console.log(`[VideoEngine] Render completed successfully: ${outputMp4}`);
    return outputMp4;
  }

  private drawFrame(
    ctx: any,
    meta: VideoMetadata,
    progress: number,
    frame: number
  ) {
    // 1. Deep Cyberpunk / Solana Gradient Background
    const bgGradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    bgGradient.addColorStop(0, "#0b0c16");
    bgGradient.addColorStop(0.5, "#140e2b");
    bgGradient.addColorStop(1, "#031c26");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Animated Ambient Grid lines
    ctx.strokeStyle = "rgba(153, 69, 255, 0.15)";
    ctx.lineWidth = 1;
    const gridOffset = (frame * 2) % 40;
    for (let x = 0; x < this.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = gridOffset; y < this.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // 3. Header Title: "SEASON ZERO // PUMP THE POOL 3"
    ctx.fillStyle = "#14F195"; // Solana Teal
    ctx.font = "bold 38px 'Courier New', monospace";
    ctx.fillText("SOLANA // SEASON ZERO: PUMP THE POOL 3", 60, 90);

    ctx.fillStyle = "#9945FF"; // Solana Purple
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillText("VERIFIED ON-CHAIN LIQUIDITY & SOCIAL QUEST CERTIFICATE", 60, 125);

    // 4. Center Metrics Panel
    const cardY = 170;
    const cardHeight = 380;
    ctx.fillStyle = "rgba(20, 14, 43, 0.85)";
    ctx.strokeStyle = "#14F195";
    ctx.lineWidth = 2;
    ctx.fillRect(60, cardY, this.width - 120, cardHeight);
    ctx.strokeRect(60, cardY, this.width - 120, cardHeight);

    // Dynamic Liquidity Metrics
    const lpSol = (Number(meta.lpAmountLamports) / 1e9).toFixed(4);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "26px sans-serif";
    ctx.fillText(`LP User: ${meta.userPubkey.slice(0, 16)}...${meta.userPubkey.slice(-8)}`, 90, cardY + 60);

    ctx.fillStyle = "#00E5FF";
    ctx.fillText(`Dynamic Pool 3 Committed: ${lpSol} SOL Equivalent`, 90, cardY + 120);

    ctx.fillStyle = "#FFD700";
    ctx.fillText(`Accumulated Season Zero Points: ${meta.totalXp} XP`, 90, cardY + 180);

    // Animated Quest Badges
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "20px sans-serif";
    ctx.fillText("Completed Social Quests:", 90, cardY + 240);

    const badgeColors = ["#14F195", "#9945FF", "#00C2FF", "#FFA500"];
    meta.completedQuests.forEach((quest, idx) => {
      const bx = 90 + idx * 240;
      const by = cardY + 270;
      // Pulse animation
      const scale = 1.0 + Math.sin(progress * Math.PI * 4 + idx) * 0.04;
      ctx.fillStyle = badgeColors[idx % badgeColors.length];
      ctx.fillRect(bx, by, 220 * scale, 40);
      ctx.fillStyle = "#000000";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText(quest, bx + 12, by + 25);
    });

    // 5. Watermark & Cryptographic TX Stamp
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "14px monospace";
    ctx.fillText(`Tx Sig: ${meta.txSignature}`, 60, this.height - 40);
    ctx.fillText(`Timestamp: ${new Date().toISOString()} | Powered by Pump the Pool v3 Engine`, 60, this.height - 20);
  }

  private compileFFmpeg(frameDir: string, outputFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-framerate",
        String(this.fps),
        "-i",
        path.join(frameDir, "frame_%04d.jpg"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "fast",
        outputFile,
      ]);

      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg failed with exit code ${code}`));
      });
      ffmpeg.on("error", (err) => reject(err));
    });
  }
}