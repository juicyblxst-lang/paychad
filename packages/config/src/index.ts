export const monad = {
  mainnet: {
    chainId: 143,
    name: "Monad",
    rpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://monadvision.com",
    usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  },
  testnet: {
    chainId: 10143,
    name: "Monad Testnet",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadvision.com",
    usdc: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
  },
} as const;

export type PayChadEnvironment = "development" | "testnet" | "production";
