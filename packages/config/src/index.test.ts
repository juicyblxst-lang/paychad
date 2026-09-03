import { describe, expect, it } from "vitest";
import { monad } from "./index";

describe("Monad configuration", () => {
  it("contains the canonical chain IDs and USDC addresses", () => {
    expect(monad.mainnet.chainId).toBe(143);
    expect(monad.testnet.chainId).toBe(10143);
    expect(monad.mainnet.usdc).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(monad.testnet.usdc).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
