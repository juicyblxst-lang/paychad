export const monad = {
  mainnet: { chainId: 143, name: "Monad" },
  testnet: { chainId: 10143, name: "Monad Testnet" },
} as const;

export type PayChadEnvironment = "development" | "testnet" | "production";
