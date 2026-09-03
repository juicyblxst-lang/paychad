import { monad as network } from "@paychad/config";
import { defineChain } from "viem";

export const monad = defineChain({
  id: network.mainnet.chainId,
  name: network.mainnet.name,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [network.mainnet.rpcUrl] } },
  blockExplorers: { default: { name: "MonadVision", url: network.mainnet.explorerUrl } },
});

export const monadTestnet = defineChain({
  id: network.testnet.chainId,
  name: network.testnet.name,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [network.testnet.rpcUrl] } },
  blockExplorers: { default: { name: "MonadVision", url: network.testnet.explorerUrl } },
});

export const PAYCHAD_USDC = {
  mainnet: network.mainnet.usdc,
  testnet: network.testnet.usdc,
} as const;

export const PAYCHAD_CONTRACT_ADDRESS = {
  mainnet: process.env.NEXT_PUBLIC_PAYCHAD_CONTRACT_ADDRESS ?? "",
  testnet: process.env.NEXT_PUBLIC_PAYCHAD_TESTNET_CONTRACT_ADDRESS ?? "",
} as const;
