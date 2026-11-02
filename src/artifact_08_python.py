#!/usr/bin/env python3
"""
Automated Video Frame Generator for Season Zero: Pump the Pool 3
Generates cinema-quality intro & quest slides for automated rendering via FFmpeg.
"""
from PIL import Image, ImageDraw, ImageFont
import os
import subprocess

def create_title_slide(output_path: str, title: str, subtitle: str, pool_stat: str):
    width, height = 1920, 1080
    image = Image.new("RGB", (width, height), color=(15, 23, 42)) # Deep slate background
    draw = ImageDraw.Draw(image)

    # Decorative Solana Gradient Bar
    for i in range(12):
        draw.rectangle([0, i * 6, width, (i + 1) * 6], fill=(16, 185, 129)) # Emerald accent

    # Draw Title & Accents
    draw.text((120, 320), title, fill=(255, 255, 255))
    draw.text((120, 440), subtitle, fill=(56, 189, 248))
    draw.text((120, 560), f"Active Metric: {pool_stat}", fill=(245, 158, 11))
    draw.text((120, 880), "Powered by Solana Anchor | ed25519 Oracle Verification", fill=(148, 163, 184))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    image.save(output_path)
    print(f"Generated frame: {output_path}")

if __name__ == "__main__":
    frame_dir = "./dist/frames"
    os.makedirs(frame_dir, exist_ok=True)
    create_title_slide(
        f"{frame_dir}/frame_01.png",
        "SEASON ZERO: PUMP THE POOL 3",
        "Decentralized Liquidity & Social Quests",
        "$5,000,000 Total Value Locked"
    )
    print("Frames successfully rendered. Ready for FFmpeg pipe.")