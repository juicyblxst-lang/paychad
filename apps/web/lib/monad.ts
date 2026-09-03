import { defineChain } from "viem";

export const monad = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://monadvision.com" } },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
});

export const PAYCHAD_USDC = {
  mainnet: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const,
  testnet: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const,
};

export const PAYCHAD_CONTRACT_ADDRESS = {
  mainnet: process.env.NEXT_PUBLIC_PAYCHAD_CONTRACT_ADDRESS ?? "",
  testnet: process.env.NEXT_PUBLIC_PAYCHAD_TESTNET_CONTRACT_ADDRESS ?? "",
} as const;
