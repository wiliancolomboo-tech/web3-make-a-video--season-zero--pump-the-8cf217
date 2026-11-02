import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { QuestVideoComposition, VideoRenderProps } from './videoComposition';

export const RemotionRoot: React.FC = () => {
  const defaultProps: VideoRenderProps = {
    walletAddress: 'DemoWallet11111111111111111111111111111111',
    seasonName: 'SEASON ZERO',
    poolName: 'PUMP THE POOL 3',
    liquidityProvidedUsd: 25420,
    questsCompletedCount: 3,
    totalQuests: 3,
    rankTitle: 'DIAMOND LIQUIDITY PROVIDER',
  };

  return (
    <Composition
      id="QuestVideoShowcase"
      component={QuestVideoComposition as any}
      durationInFrames={150} // 5 seconds at 30 fps
      fps={30}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
    />
  );
};

registerRoot(RemotionRoot);