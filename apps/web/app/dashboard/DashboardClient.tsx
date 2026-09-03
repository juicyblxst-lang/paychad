"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { Address, parseUnits } from "viem";
import { monad, monadTestnet, PAYCHAD_CONTRACT_ADDRESS } from "../../lib/monad";
import { payrollAbi } from "../../lib/payroll";
import { WalletButton } from "../components/WalletButton";

function shorten(address?: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
}

export function DashboardClient() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [companyName, setCompanyName] = useState("");
  const [employeeWallet, setEmployeeWallet] = useState("");
  const [salary, setSalary] = useState("");
  const [registerHash, setRegisterHash] = useState<`0x${string}`>();
  const [employeeHash, setEmployeeHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState("");

  const contractAddress = useMemo(() => {
    const configured = chainId === monadTestnet.id ? PAYCHAD_CONTRACT_ADDRESS.testnet : PAYCHAD_CONTRACT_ADDRESS.mainnet;
    return configured && configured.startsWith("0x") ? configured as Address : undefined;
  }, [chainId]);

  const { data: companyId } = useReadContract({
    address: contractAddress,
    abi: payrollAbi,
    functionName: "companyIdByOwner",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(contractAddress && address) },
  });

  const { data: company, refetch: refetchCompany } = useReadContract({
    address: contractAddress,
    abi: payrollAbi,
    functionName: "getCompany",
    args: companyId && companyId > 0n ? [companyId] : undefined,
    query: { enabled: Boolean(contractAddress && companyId && companyId > 0n) },
  });

  const { writeContractAsync: registerCompany, isPending: isRegistering } = useWriteContract();
  const { writeContractAsync: addEmployee, isPending: isAddingEmployee } = useWriteContract();

  const { isLoading: isRegisterPending, isSuccess: isRegisterConfirmed } = useWaitForTransactionReceipt({
    hash: registerHash,
    query: { enabled: Boolean(registerHash) },
  });

  const { isLoading: isEmployeePending, isSuccess: isEmployeeConfirmed } = useWaitForTransactionReceipt({
    hash: employeeHash,
    query: { enabled: Boolean(employeeHash) },
  });

  useEffect(() => {
    if (isRegisterConfirmed || isEmployeeConfirmed) void refetchCompany();
  }, [isRegisterConfirmed, isEmployeeConfirmed, refetchCompany]);

  async function submitCompany(event: FormEvent) {
    event.preventDefault();
    setErrorMessage("");
    if (!contractAddress) return setErrorMessage("PayChad is not deployed on this network yet.");
    if (!companyName.trim()) return setErrorMessage("Enter a company name.");
    try {
      const hash = await registerCompany({ address: contractAddress, abi: payrollAbi, functionName: "registerCompany", args: [companyName.trim()] });
      setRegisterHash(hash);
      setCompanyName("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Company registration failed.");
    }
  }

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    setErrorMessage("");
    if (!contractAddress) return setErrorMessage("PayChad is not deployed on this network yet.");
    if (!companyId || companyId === 0n) return setErrorMessage("Register a company first.");
    if (!/^0x[a-fA-F0-9]{40}$/.test(employeeWallet)) return setErrorMessage("Enter a valid employee wallet address.");
    const amount = Number(salary);
    if (!Number.isFinite(amount) || amount <= 0) return setErrorMessage("Enter a valid monthly salary.");
    try {
      const hash = await addEmployee({
        address: contractAddress,
        abi: payrollAbi,
        functionName: "addEmployee",
        args: [companyId, employeeWallet as Address, parseUnits(salary, 6)],
      });
      setEmployeeHash(hash);
      setEmployeeWallet("");
      setSalary("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Employee registration failed.");
    }
  }

  const isWrongNetwork = isConnected && chainId !== monad.id && chainId !== monadTestnet.id;
  const employeeCount = company?.employeeCount ?? 0n;
  const payrollBalance = company?.payrollBalance ?? 0n;

  return (
    <>
      <header className="dashboard-header">
        <div>
          <div className="dashboard-kicker">PAYCHAD COMMAND CENTER</div>
          <h1>Run payroll without the spreadsheet.</h1>
          <p>Company ownership, payroll balances, employee records, and payment execution are anchored onchain.</p>
        </div>
        <WalletButton />
      </header>

      {!isConnected ? (
        <section className="panel"><h2>Connect your wallet</h2><p>Connect the employer wallet to create a company and manage payroll.</p></section>
      ) : isWrongNetwork ? (
        <section className="panel"><h2>Wrong network</h2><p>Switch to Monad Mainnet or Monad Testnet before using PayChad.</p></section>
      ) : !contractAddress ? (
        <section className="panel"><h2>Contract deployment pending</h2><p>This environment has no PayChad contract address configured yet. Wallet connectivity is live; financial actions remain disabled until a verified deployment is configured.</p></section>
      ) : (
        <>
          <section className="stat-grid">
            <article className="stat-card"><small>Payroll balance</small><strong>{Number(payrollBalance) / 1e6} USDC</strong></article>
            <article className="stat-card"><small>Active employees</small><strong>{employeeCount.toString()}</strong></article>
            <article className="stat-card"><small>Company</small><strong>{company?.name ?? "Not registered"}</strong></article>
            <article className="stat-card"><small>Employer wallet</small><strong>{shorten(address)}</strong></article>
          </section>

          {!companyId || companyId === 0n ? (
            <section className="panel">
              <h2>Create your company</h2>
              <p>The transaction creates an onchain company record owned by the connected wallet.</p>
              <form className="form-row" onSubmit={submitCompany}>
                <input className="text-input" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company name" maxLength={80} />
                <button className="button button-primary" disabled={isRegistering || isRegisterPending}>{isRegistering ? "Confirm in wallet…" : isRegisterPending ? "Registering…" : "Register company"}</button>
              </form>
              {registerHash ? <p className="status">Registration transaction: {registerHash}</p> : null}
            </section>
          ) : (
            <>
              <section className="panel">
                <h2>Add an employee</h2>
                <p>Salary is stored in USDC base units (6 decimals). The employee wallet receives funds directly from the payroll contract during a run.</p>
                <form className="form-row" onSubmit={submitEmployee}>
                  <input className="text-input" value={employeeWallet} onChange={(event) => setEmployeeWallet(event.target.value)} placeholder="Employee wallet address" />
                  <input className="text-input" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Monthly salary (USDC)" inputMode="decimal" />
                  <button className="button button-primary" disabled={isAddingEmployee || isEmployeePending}>{isAddingEmployee ? "Confirm in wallet…" : isEmployeePending ? "Adding…" : "Add employee"}</button>
                </form>
                {employeeHash ? <p className="status">Employee transaction: {employeeHash}</p> : null}
              </section>
              <section className="panel">
                <h2>Next: fund and execute</h2>
                <p>USDC approval, payroll funding, payroll-run creation, and batched payouts are the next connected workflow. No funding balance is simulated here.</p>
              </section>
            </>
          )}
        </>
      )}

      {errorMessage ? <p className="status inline-error">{errorMessage}</p> : null}
      <p className="status">Network: {chainId === monad.id ? "Monad Mainnet" : chainId === monadTestnet.id ? "Monad Testnet" : `Chain ${chainId}`}</p>
    </>
  );
}
