import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface SeasonZeroVideoProps {
  userWallet: string;
  pumpPoolName: string;
  lpStakedFormatted: string;
  multiplierBps: number;
  questsCompletedCount: number;
  totalQuests: number;
  rank: number;
}

export const SeasonZeroVideo: React.FC<SeasonZeroVideoProps> = ({
  userWallet,
  pumpPoolName = "Pump the Pool 3 (SOL/USDC High-Yield)",
  lpStakedFormatted = "25,000.00 USDC-LP",
  multiplierBps = 17500,
  questsCompletedCount = 3,
  totalQuests = 3,
  rank = 42,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animations
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });
  const cardScale = spring({
    frame: frame - 15,
    fps,
    config: { damping: 12 },
  });
  const multiplierScale = spring({
    frame: frame - 35,
    fps,
    config: { damping: 10 },
  });

  const formattedMultiplier = (multiplierBps / 10000).toFixed(2);
  const truncatedWallet = `${userWallet.slice(0, 4)}...${userWallet.slice(-4)}`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0A0B10",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: "#FFFFFF",
        padding: "60px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* Background Gradient Mesh */}
      <div
        style={{
          position: "absolute",
          top: -200,
          left: -200,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(153,69,255,0.25) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(80px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -200,
          right: -200,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(20,241,149,0.2) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Header */}
      <div style={{ opacity: titleOpacity, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span
            style={{
              background: "linear-gradient(90deg, #9945FF, #14F195)",
              padding: "6px 14px",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
            }}
          >
            Solana Ecosystem
          </span>
          <span style={{ fontSize: "16px", color: "#8E92A4", fontWeight: 600 }}>
            Season Zero Proof-of-Liquidity
          </span>
        </div>
        <h1
          style={{
            fontSize: "56px",
            fontWeight: 900,
            margin: "16px 0 0 0",
            letterSpacing: "-1px",
            background: "linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {pumpPoolName}
        </h1>
      </div>

      {/* Center Metrics Dashboard */}
      <div
        style={{
          transform: `scale(${cardScale < 0 ? 0 : cardScale})`,
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr",
          gap: "24px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(22, 24, 34, 0.75)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            padding: "32px",
          }}
        >
          <div style={{ fontSize: "16px", color: "#9CA3AF", marginBottom: "8px" }}>
            LP Contributed
          </div>
          <div style={{ fontSize: "38px", fontWeight: 800, color: "#14F195" }}>
            {lpStakedFormatted}
          </div>
          <div style={{ fontSize: "14px", color: "#6B7280", marginTop: "12px" }}>
            Wallet: <span style={{ color: "#E5E7EB", fontFamily: "monospace" }}>{truncatedWallet}</span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "rgba(22, 24, 34, 0.75)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            padding: "32px",
            transform: `scale(${multiplierScale < 0 ? 0 : multiplierScale})`,
          }}
        >
          <div style={{ fontSize: "16px", color: "#9CA3AF", marginBottom: "8px" }}>
            Yield Multiplier
          </div>
          <div style={{ fontSize: "38px", fontWeight: 800, color: "#9945FF" }}>
            {formattedMultiplier}x
          </div>
          <div style={{ fontSize: "14px", color: "#6B7280", marginTop: "12px" }}>
            Social Quests: <span style={{ color: "#14F195", fontWeight: 700 }}>{questsCompletedCount}/{totalQuests} Complete</span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "rgba(22, 24, 34, 0.75)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            padding: "32px",
          }}
        >
          <div style={{ fontSize: "16px", color: "#9CA3AF", marginBottom: "8px" }}>
            Leaderboard Tier
          </div>
          <div style={{ fontSize: "38px", fontWeight: 800, color: "#38BDF8" }}>
            #{rank}
          </div>
          <div style={{ fontSize: "14px", color: "#6B7280", marginTop: "12px" }}>
            Season Zero Genesis Contributor
          </div>
        </div>
      </div>

      {/* Footer / CTA */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          paddingTop: "24px",
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: "16px", color: "#9CA3AF" }}>
          Pump the Pool 3 Campaign &bull; Powered by Solana Programmatic Video Engine
        </div>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "#FFFFFF" }}>
          seasonzero.solana.io
        </div>
      </div>
    </AbsoluteFill>
  );
};