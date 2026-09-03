"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";

function shorten(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet-cluster">
        <span className="wallet-network">{chain?.name ?? "Unknown network"}</span>
        <button className="button button-primary" onClick={() => disconnect()}>
          {shorten(address)}
        </button>
      </div>
    );
  }

  const connector = connectors[0];
  return (
    <div>
      <button
        className="button button-primary"
        disabled={!connector || isPending}
        onClick={() => connector && connect({ connector })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error ? <p className="inline-error">{error.message}</p> : null}
    </div>
  );
}
