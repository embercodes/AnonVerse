import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'AnonVerse',
  projectId: '681dbaf6568a4d34bfb06ee9b03643c6',
  chains: [sepolia],
  ssr: false,
});
