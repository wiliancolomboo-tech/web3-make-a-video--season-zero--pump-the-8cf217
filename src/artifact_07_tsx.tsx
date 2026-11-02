import React from "react";
import { Composition } from "remotion";
import { SeasonZeroVideo } from "./SeasonZeroVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SeasonZeroExplainer"
        component={SeasonZeroVideo}
        durationInFrames={300} // 10 seconds at 30 fps (or 5s at 60fps)
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          poolName: "Pump the Pool 3 (SOL/USDC DLMM)",
          seasonName: "Season Zero: Genesis Liquidity",
          currentTvlUsd: "$3,842,100",
          baseYieldApy: "214.5%",
          questMultiplier: "+45% Total Boost",
          featuredWallet: "DemoUser111111111111111111111111111111111",
        }}
      />
    </>
  );
};

export default RemotionRoot;