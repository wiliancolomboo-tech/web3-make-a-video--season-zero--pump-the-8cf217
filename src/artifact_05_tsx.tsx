import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export interface VideoDataProps {
  poolName: string;
  seasonName: string;
  currentTvlUsd: string;
  baseYieldApy: string;
  questMultiplier: string;
  featuredWallet: string;
}

export const SeasonZeroVideo: React.FC<VideoDataProps> = ({
  poolName = "Pump the Pool 3",
  seasonName = "Season Zero: Genesis Liquidity",
  currentTvlUsd = "$2,450,800",
  baseYieldApy = "184.2%",
  questMultiplier = "2.5x Boost",
  featuredWallet = "9xQe...4Kmp",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance animations
  const logoSpring = spring({ frame, fps, config: { damping: 12 } });
  const cardTranslate = interpolate(frame, [0, 30], [80, 0], { extrapolateRight: "clamp" });
  const cardOpacity = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  const pulse = Math.sin(frame / 10) * 5;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0B0E14",
        fontFamily: "Inter, 'SF Pro Display', -apple-system, sans-serif",
        color: "#FFFFFF",
        padding: "60px 80px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxSizing: "border-box",
      }}
    >
      {/* Background Gradient Orbs */}
      <div
        style={{
          position: "absolute",
          top: -100,
          right: -100,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(153,69,255,0.35) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(20,241,149,0.25) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 24,
            }}
          >
            S0
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px" }}>
              SOLANA DEFI CAMPAIGN
            </h2>
            <span style={{ fontSize: "16px", color: "#9CA3AF" }}>{seasonName}</span>
          </div>
        </div>

        <div
          style={{
            padding: "8px 20px",
            borderRadius: "30px",
            backgroundColor: "rgba(20, 241, 149, 0.12)",
            border: "1px solid rgba(20, 241, 149, 0.4)",
            color: "#14F195",
            fontWeight: 700,
            fontSize: "16px",
          }}
        >
          LIVE ON SOLANA MAINNET
        </div>
      </div>

      {/* Hero Section: Pump the Pool 3 */}
      <div
        style={{
          zIndex: 10,
          transform: `translateY(${cardTranslate}px)`,
          opacity: cardOpacity,
          marginTop: "40px",
        }}
      >
        <div
          style={{
            fontSize: "20px",
            textTransform: "uppercase",
            letterSpacing: "3px",
            color: "#9945FF",
            fontWeight: 800,
            marginBottom: "8px",
          }}
        >
          Featured Liquidity Incentive
        </div>
        <h1
          style={{
            fontSize: "72px",
            fontWeight: 900,
            lineHeight: 1.05,
            margin: "0 0 20px 0",
            background: "linear-gradient(90deg, #FFFFFF 0%, #E5E7EB 50%, #9945FF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {poolName}
        </h1>
        <p style={{ fontSize: "22px", color: "#D1D5DB", maxWidth: "800px", margin: 0 }}>
          Deposit targeted liquidity, unlock dynamic DLMM trading fees, and boost your Season Zero point
          yield through synchronized on-chain social actions.
        </p>
      </div>

      {/* Dynamic Metrics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "20px",
            padding: "32px",
            backdropFilter: "blur(20px)",
            transform: `scale(${logoSpring})`,
          }}
        >
          <div style={{ color: "#9CA3AF", fontSize: "16px", fontWeight: 600 }}>CURRENT POOL TVL</div>
          <div style={{ fontSize: "44px", fontWeight: 800, marginTop: "8px", color: "#FFFFFF" }}>
            {currentTvlUsd}
          </div>
          <div style={{ color: "#14F195", fontSize: "14px", fontWeight: 600, marginTop: "6px" }}>
            ↑ Verified On-Chain
          </div>
        </div>

        <div
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "20px",
            padding: "32px",
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ color: "#9CA3AF", fontSize: "16px", fontWeight: 600 }}>DYNAMIC MAX APY</div>
          <div style={{ fontSize: "44px", fontWeight: 800, marginTop: "8px", color: "#14F195" }}>
            {baseYieldApy}
          </div>
          <div style={{ color: "#9CA3AF", fontSize: "14px", marginTop: "6px" }}>
            DLMM Fee + Point Rewards
          </div>
        </div>

        <div
          style={{
            backgroundColor: "rgba(153, 69, 255, 0.08)",
            border: "1px solid rgba(153, 69, 255, 0.3)",
            borderRadius: "20px",
            padding: "32px",
            backdropFilter: "blur(20px)",
          }}
        >
          <div style={{ color: "#C084FC", fontSize: "16px", fontWeight: 600 }}>SOCIAL QUEST MULTIPLIER</div>
          <div
            style={{
              fontSize: "44px",
              fontWeight: 800,
              marginTop: "8px",
              color: "#A855F7",
              transform: `translateY(${pulse}px)`,
            }}
          >
            {questMultiplier}
          </div>
          <div style={{ color: "#D8B4FE", fontSize: "14px", marginTop: "6px" }}>
            Video Guide + X + Discord
          </div>
        </div>
      </div>

      {/* Quest Checklist & Step Guide Footer */}
      <div
        style={{
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "16px",
          padding: "20px 30px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", gap: "40px" }}>
          <div>
            <span style={{ color: "#14F195", fontWeight: 800 }}>STEP 1: </span>
            <span style={{ color: "#E5E7EB" }}>Deposit to Pump the Pool 3</span>
          </div>
          <div>
            <span style={{ color: "#14F195", fontWeight: 800 }}>STEP 2: </span>
            <span style={{ color: "#E5E7EB" }}>Submit Video / Social Quest</span>
          </div>
          <div>
            <span style={{ color: "#14F195", fontWeight: 800 }}>STEP 3: </span>
            <span style={{ color: "#E5E7EB" }}>Claim Boosted Multiplier</span>
          </div>
        </div>
        <div style={{ color: "#6B7280", fontSize: "14px", fontFamily: "monospace" }}>
          Wallet: {featuredWallet}
        </div>
      </div>
    </AbsoluteFill>
  );
};