import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface Props {
  poolName: string;
  seasonName: string;
  currentApy: string;
  rewardPool: string;
  userAddress: string;
  referralCode: string;
}

export const SeasonZeroComposition: React.FC<Props> = ({
  poolName = "Pump the Pool 3 (SOL/USDC)",
  seasonName = "Season Zero",
  currentApy = "142.8%",
  rewardPool = "100,000 USDC + 1M Points",
  userAddress = "SzQ3...Pump",
  referralCode = "SOL-ZERO-HERO",
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const badgeTranslateY = interpolate(frame, [20, 50], [40, 0], { extrapolateRight: "clamp" });
  const pulseScale = 1 + 0.05 * Math.sin((frame / fps) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#07090e",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#ffffff",
        padding: 80,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundImage: "radial-gradient(circle at 50% 30%, #1a103c 0%, #07090e 70%)",
      }}
    >
      {/* Top Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: "#14F195", letterSpacing: "2px" }}>
          SOLANA ECOSYSTEM
        </div>
        <div
          style={{
            backgroundColor: "#9945FF",
            padding: "10px 24px",
            borderRadius: 999,
            fontSize: 22,
            fontWeight: 700,
          }}
        >
          {seasonName.toUpperCase()} ACTIVE
        </div>
      </div>

      {/* Main Campaign Hero */}
      <div style={{ opacity: titleOpacity, transform: `translateY(${badgeTranslateY}px)` }}>
        <h1
          style={{
            fontSize: 84,
            fontWeight: 900,
            lineHeight: 1.1,
            margin: 0,
            background: "linear-gradient(90deg, #FFFFFF, #9945FF, #14F195)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          {poolName}
        </h1>
        <p style={{ fontSize: 36, color: "#a1a1aa", marginTop: 20 }}>
          Complete Social Quests. Provide Liquidity. Earn Season Zero Yield.
        </p>

        {/* Dynamic Metrics Panel */}
        <div style={{ display: "flex", gap: 40, marginTop: 40 }}>
          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(20, 241, 149, 0.3)",
              padding: "24px 40px",
              borderRadius: 20,
              transform: `scale(${pulseScale})`,
            }}
          >
            <div style={{ fontSize: 20, color: "#9ca3af" }}>Projected APY</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#14F195" }}>{currentApy}</div>
          </div>

          <div
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(153, 69, 255, 0.3)",
              padding: "24px 40px",
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 20, color: "#9ca3af" }}>Reward Pool Allocated</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#c084fc" }}>{rewardPool}</div>
          </div>
        </div>
      </div>

      {/* Footer / Referral Call to Action */}
      <div
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.1)",
          paddingTop: 30,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, color: "#71717a" }}>VERIFIED AMBASSADOR KEY</div>
          <div style={{ fontSize: 24, fontFamily: "monospace", color: "#e4e4e7" }}>{userAddress}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, color: "#71717a" }}>REFERRAL QUEST CODE</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#14F195" }}>{referralCode}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};