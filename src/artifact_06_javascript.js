#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createCanvas } = require("canvas");
const ffmpeg = require("fluent-ffmpeg");

// Parse CLI flags
const args = process.argv.slice(2).reduce((acc, curr) => {
  const [k, v] = curr.replace(/^--/, "").split("=");
  acc[k] = v;
  return acc;
}, {});

const wallet = args.wallet || "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const points = args.points || "1500";
const lp = args.lp || "42.85 LP";
const outFile = args.out || path.join(__dirname, "output_milestone.mp4");

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const DURATION_SEC = 4;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const FRAMES_DIR = path.join(__dirname, "temp_frames");

if (!fs.existsSync(FRAMES_DIR)) {
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
}

console.log(`[VideoPipeline] Rendering ${TOTAL_FRAMES} frames for ${wallet}...`);

// Generate Frames with high-tech Solana Dark-Mode Theme
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext("2d");

for (let i = 0; i < TOTAL_FRAMES; i++) {
  const progress = i / TOTAL_FRAMES;

  // Background Gradient
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#0a0a12");
  gradient.addColorStop(1, "#14142b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Animated Neon Grid Accent
  ctx.strokeStyle = "rgba(0, 255, 163, 0.15)";
  ctx.lineWidth = 1;
  const gridOffset = (i * 2) % 40;
  for (let x = 0; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x + gridOffset, 0);
    ctx.lineTo(x + gridOffset, HEIGHT);
    ctx.stroke();
  }

  // Header Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px 'DejaVu Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SEASON ZERO: PUMP THE POOL 3", WIDTH / 2, 140);

  // Subheader badge
  ctx.fillStyle = "#dc1fff";
  ctx.font = "600 24px 'DejaVu Sans', sans-serif";
  ctx.fillText("ON-CHAIN VERIFIED LIQUIDITY & QUEST COMPLETION", WIDTH / 2, 190);

  // Central Hologram Card
  ctx.fillStyle = "rgba(20, 20, 35, 0.85)";
  ctx.strokeStyle = "#00ffa3";
  ctx.lineWidth = 3;
  const cardW = 860;
  const cardH = 340;
  const cardX = (WIDTH - cardW) / 2;
  const cardY = 240;
  ctx.strokeRect(cardX, cardY, cardW, cardH);
  ctx.fillRect(cardX, cardY, cardW, cardH);

  // Stats Text
  ctx.textAlign = "left";
  ctx.fillStyle = "#a0a0c0";
  ctx.font = "20px 'DejaVu Sans', sans-serif";
  ctx.fillText("CONTRIBUTOR WALLET:", cardX + 50, cardY + 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px 'DejaVu Sans', monospace";
  ctx.fillText(wallet, cardX + 50, cardY + 110);

  ctx.fillStyle = "#a0a0c0";
  ctx.font = "20px 'DejaVu Sans', sans-serif";
  ctx.fillText("PUMP THE POOL 3 LP POOL SHARE:", cardX + 50, cardY + 180);
  ctx.fillStyle = "#00ffa3";
  ctx.font = "bold 32px 'DejaVu Sans', sans-serif";
  ctx.fillText(lp, cardX + 50, cardY + 225);

  ctx.fillStyle = "#a0a0c0";
  ctx.font = "20px 'DejaVu Sans', sans-serif";
  ctx.fillText("QUEST REWARD POINTS:", cardX + 500, cardY + 180);
  ctx.fillStyle = "#dc1fff";
  ctx.font = "bold 38px 'DejaVu Sans', sans-serif";
  
  // Interpolated animated count-up
  const animatedPoints = Math.floor(progress * parseInt(points, 10));
  ctx.fillText(`+${animatedPoints} PTS`, cardX + 500, cardY + 230);

  // Bottom Status
  ctx.textAlign = "center";
  ctx.fillStyle = "#00ffa3";
  ctx.font = "18px 'DejaVu Sans', monospace";
  ctx.fillText("CRYPTOGRAPHICALLY AUDITED ON SOLANA RUNTIME", WIDTH / 2, 630);

  // Save frame
  const frameNumber = String(i).padStart(4, "0");
  const framePath = path.join(FRAMES_DIR, `frame_${frameNumber}.png`);
  fs.writeFileSync(framePath, canvas.toBuffer("image/png"));
}

// Stitch frames to MP4 using fluent-ffmpeg
ffmpeg()
  .input(path.join(FRAMES_DIR, "frame_%04d.png"))
  .inputFPS(FPS)
  .outputOptions([
    "-c:v libx264",
    "-pix_fmt yuv420p",
    "-crf 20",
    "-movflags +faststart"
  ])
  .save(outFile)
  .on("end", () => {
    // Cleanup temporary frames
    const files = fs.readdirSync(FRAMES_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(FRAMES_DIR, f));
    }
    fs.rmdirSync(FRAMES_DIR);
    console.log(`[VideoPipeline] Encoded video successfully to ${outFile}`);
    process.exit(0);
  })
  .on("error", (err) => {
    console.error("[VideoPipeline] Encoding failed:", err);
    process.exit(1);
  });