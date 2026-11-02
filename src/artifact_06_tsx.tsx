import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import React from "react";

export interface VideoProps {
  campaignName: string;
  totalPoolPrize: string;
}

export const SeasonZeroVideo: React.FC<VideoProps> = ({ campaignName, totalPoolPrize }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animations
  const titleOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const titleY = interpolate(frame, [0, 25], [40, 0], { extrapolateRight: "clamp" });

  const badgeScale = spring({
    frame: frame - 25,
    fps,
    config: { damping: 12 },
  });

  const neonGlow = interpolate(
    Math.sin(frame / 10),
    [-1, 1],
    [0.4, 0.9]
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#07080a",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "'Inter', sans-serif",
        color: "#ffffff",
      }}
    >
      {/* Background radial gradient */}
      <div
        style={{
          position: "absolute",
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(153,69,255,0.25) 0%, rgba(20,241,149,0.05) 70%, transparent 100%)",
          filter: "blur(80px)",
        }}
      />

      {/* Main Content */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: "center",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#14f195",
            fontWeight: 800,
            marginBottom: 10,
          }}
        >
          Solana Ecosystem Bounty Initiative
        </div>

        <h1
          style={{
            fontSize: 76,
            fontWeight: 900,
            margin: "0 0 20px 0",
            background: "linear-gradient(90deg, #FFFFFF 0%, #14F195 50%, #9945FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: `0 0 40px rgba(20, 241, 149, ${neonGlow})`,
          }}
        >
          SEASON ZERO: {campaignName}
        </h1>

        {/* Dynamic Badge */}
        <div
          style={{
            display: "inline-block",
            transform: `scale(${Math.max(0, badgeScale)})`,
            background: "rgba(255, 255, 255, 0.05)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(20, 241, 149, 0.4)",
            borderRadius: 16,
            padding: "18px 36px",
            marginTop: 20,
          }}
        >
          <div style={{ fontSize: 20, color: "#a1a1aa" }}>Active Campaign Liquidity Incentive</div>
          <div style={{ fontSize: 44, fontWeight: 800, color: "#14F195", marginTop: 4 }}>
            {totalPoolPrize} REWARD VAULT
          </div>
          <div style={{ fontSize: 16, color: "#9945FF", marginTop: 8, fontWeight: 600 }}>
            Social Quests • Instant Multipliers • On-Chain Ed25519 Proofs
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};