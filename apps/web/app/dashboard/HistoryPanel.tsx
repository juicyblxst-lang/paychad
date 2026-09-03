"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { monadTestnet } from "../../lib/monad";
import { payrollAbi } from "../../lib/payroll";
import { PAYCHAD_CONTRACT_ADDRESS } from "../../lib/monad";

type PayrollRun = {
  run_id: string;
  created_at: string;
  completed_at: string | null;
  total_paid_base_units: string | null;
  employee_count: string | null;
};

type Payment = {
  run_id: string;
  employee_id: string;
  recipient_address: string;
  amount_base_units: string;
  transaction_hash: string;
  paid_at: string;
};

const API_URL = process.env.NEXT_PUBLIC_PAYCHAD_API_URL?.replace(/\/$/, "");

function formatUsdc(baseUnits: string | null): string {
  if (!baseUnits) return "—";
  const value = BigInt(baseUnits);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function shorten(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function HistoryPanel() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const contractAddress = chainId === monadTestnet.id ? PAYCHAD_CONTRACT_ADDRESS.testnet : PAYCHAD_CONTRACT_ADDRESS.mainnet;
  const { data: companyId } = useReadContract({
    address: contractAddress && contractAddress.startsWith("0x") ? contractAddress : undefined,
    abi: payrollAbi,
    functionName: "companyIdByOwner",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && contractAddress) },
  });

  useEffect(() => {
    if (!API_URL || !address || !companyId || companyId === 0n || (chainId !== monadTestnet.id && chainId !== 143)) return;
    const controller = new AbortController();
    setError("");
    const query = `chainId=${chainId}&owner=${encodeURIComponent(address)}`;
    const headers = { "x-wallet-address": address };
    void Promise.all([
      fetch(`${API_URL}/v1/companies/${companyId.toString()}/payroll-runs?chainId=${chainId}`, { headers, signal: controller.signal }),
      fetch(`${API_URL}/v1/companies/${companyId.toString()}/payments?chainId=${chainId}`, { headers, signal: controller.signal }),
    ]).then(async ([runsResponse, paymentsResponse]) => {
      if (!runsResponse.ok || !paymentsResponse.ok) throw new Error("History API request failed");
      setRuns(await runsResponse.json() as PayrollRun[]);
      setPayments(await paymentsResponse.json() as Payment[]);
      void query;
    }).catch((requestError: unknown) => {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : "Unable to load payroll history");
    });
    return () => controller.abort();
  }, [address, chainId, companyId]);

  if (!API_URL) return null;
  if (!address || !companyId || companyId === 0n) return null;

  return (
    <section className="panel">
      <h2>Payroll history</h2>
      {error ? <p className="status inline-error">{error}</p> : null}
      {!error && runs.length === 0 ? <p className="status">No indexed payroll runs yet. Confirmed blockchain events will appear here after the indexer catches up.</p> : null}
      {runs.length > 0 ? (
        <div className="history-list">
          {runs.map((run) => (
            <article key={run.run_id} className="history-row">
              <div><strong>Run #{run.run_id}</strong><span>{run.completed_at ? "Completed" : "Created"}</span></div>
              <div><span>{formatUsdc(run.total_paid_base_units)} USDC</span><span>{run.employee_count ?? "0"} employees</span></div>
            </article>
          ))}
        </div>
      ) : null}
      {payments.length > 0 ? (
        <div className="history-list">
          {payments.slice(0, 10).map((payment) => (
            <article key={`${payment.transaction_hash}:${payment.employee_id}`} className="history-row">
              <div><strong>Employee #{payment.employee_id}</strong><span>{shorten(payment.recipient_address)}</span></div>
              <div><span>{formatUsdc(payment.amount_base_units)} USDC</span><span>{shorten(payment.transaction_hash)}</span></div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
