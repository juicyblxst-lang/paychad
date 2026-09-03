"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Address, formatUnits, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { monad, monadTestnet, PAYCHAD_CONTRACT_ADDRESS, PAYCHAD_USDC } from "../../lib/monad";
import { erc20Abi, payrollAbi } from "../../lib/payroll";
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
  const [fundAmount, setFundAmount] = useState("");
  const [registerHash, setRegisterHash] = useState<`0x${string}`>();
  const [employeeHash, setEmployeeHash] = useState<`0x${string}`>();
  const [approveHash, setApproveHash] = useState<`0x${string}`>();
  const [fundHash, setFundHash] = useState<`0x${string}`>();
  const [runHash, setRunHash] = useState<`0x${string}`>();
  const [executeHash, setExecuteHash] = useState<`0x${string}`>();
  const [pendingFundAmount, setPendingFundAmount] = useState<bigint>();
  const [pendingRunId, setPendingRunId] = useState<bigint>();
  const [fundStarted, setFundStarted] = useState(false);
  const [executeStarted, setExecuteStarted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const contractAddress = useMemo(() => {
    const configured = chainId === monadTestnet.id ? PAYCHAD_CONTRACT_ADDRESS.testnet : PAYCHAD_CONTRACT_ADDRESS.mainnet;
    return configured && configured.startsWith("0x") ? configured as Address : undefined;
  }, [chainId]);

  const usdcAddress = useMemo(() => {
    const configured = chainId === monadTestnet.id ? PAYCHAD_USDC.testnet : PAYCHAD_USDC.mainnet;
    return configured as Address;
  }, [chainId]);

  const { data: companyId, refetch: refetchCompanyId } = useReadContract({
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

  const { data: walletUsdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && isConnected) },
  });

  const { data: activeEmployeeIds, refetch: refetchActiveEmployees } = useReadContract({
    address: contractAddress,
    abi: payrollAbi,
    functionName: "getActiveEmployeeIds",
    args: companyId && companyId > 0n ? [companyId] : undefined,
    query: { enabled: Boolean(contractAddress && companyId && companyId > 0n) },
  });

  const { writeContractAsync: registerCompany, isPending: isRegistering } = useWriteContract();
  const { writeContractAsync: addEmployee, isPending: isAddingEmployee } = useWriteContract();
  const { writeContractAsync: approveUsdc, isPending: isApproving } = useWriteContract();
  const { writeContractAsync: fundPayroll, isPending: isFunding } = useWriteContract();
  const { writeContractAsync: createRun, isPending: isCreatingRun } = useWriteContract();
  const { writeContractAsync: executePayroll, isPending: isExecuting } = useWriteContract();

  const { isLoading: isRegisterPending, isSuccess: isRegisterConfirmed } = useWaitForTransactionReceipt({ hash: registerHash, query: { enabled: Boolean(registerHash) } });
  const { isLoading: isEmployeePending, isSuccess: isEmployeeConfirmed } = useWaitForTransactionReceipt({ hash: employeeHash, query: { enabled: Boolean(employeeHash) } });
  const { isLoading: isApprovePending, isSuccess: isApproveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash, query: { enabled: Boolean(approveHash) } });
  const { isLoading: isFundPending, isSuccess: isFundConfirmed } = useWaitForTransactionReceipt({ hash: fundHash, query: { enabled: Boolean(fundHash) } });
  const { isLoading: isRunPending, isSuccess: isRunConfirmed } = useWaitForTransactionReceipt({ hash: runHash, query: { enabled: Boolean(runHash) } });
  const { isLoading: isExecutePending, isSuccess: isExecuteConfirmed } = useWaitForTransactionReceipt({ hash: executeHash, query: { enabled: Boolean(executeHash) } });

  useEffect(() => {
    if (isRegisterConfirmed) {
      void refetchCompanyId();
      void refetchCompany();
    }
    if (isEmployeeConfirmed) {
      void refetchCompany();
      void refetchActiveEmployees();
    }
    if (isFundConfirmed) {
      void refetchCompany();
      void refetchUsdcBalance();
      setFundAmount("");
      setPendingFundAmount(undefined);
    }
    if (isExecuteConfirmed) {
      void refetchCompany();
      void refetchActiveEmployees();
      setPendingRunId(undefined);
    }
  }, [isRegisterConfirmed, isEmployeeConfirmed, isFundConfirmed, isExecuteConfirmed, refetchCompanyId, refetchCompany, refetchActiveEmployees, refetchUsdcBalance]);

  useEffect(() => {
    if (!isApproveConfirmed || !pendingFundAmount || fundStarted || !companyId || !contractAddress) return;
    setFundStarted(true);
    void fundPayroll({
      address: contractAddress,
      abi: payrollAbi,
      functionName: "fundPayroll",
      args: [companyId, pendingFundAmount],
    }).then(setFundHash).catch((error: unknown) => {
      setFundStarted(false);
      setErrorMessage(error instanceof Error ? error.message : "Payroll funding failed.");
    });
  }, [isApproveConfirmed, pendingFundAmount, fundStarted, companyId, contractAddress, fundPayroll]);

  useEffect(() => {
    if (!isRunConfirmed || pendingRunId === undefined || executeStarted || !companyId || !contractAddress) return;
    if (!activeEmployeeIds || activeEmployeeIds.length === 0) {
      setErrorMessage("There are no active employees to pay.");
      return;
    }
    setExecuteStarted(true);
    void executePayroll({
      address: contractAddress,
      abi: payrollAbi,
      functionName: "executePayroll",
      args: [companyId, pendingRunId, activeEmployeeIds],
    }).then(setExecuteHash).catch((error: unknown) => {
      setExecuteStarted(false);
      setErrorMessage(error instanceof Error ? error.message : "Payroll execution failed.");
    });
  }, [isRunConfirmed, pendingRunId, executeStarted, companyId, contractAddress, activeEmployeeIds, executePayroll]);

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
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(salary) || Number(salary) <= 0) return setErrorMessage("Enter a valid monthly salary.");
    try {
      const hash = await addEmployee({ address: contractAddress, abi: payrollAbi, functionName: "addEmployee", args: [companyId, employeeWallet as Address, parseUnits(salary, 6)] });
      setEmployeeHash(hash);
      setEmployeeWallet("");
      setSalary("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Employee registration failed.");
    }
  }

  async function submitFunding(event: FormEvent) {
    event.preventDefault();
    setErrorMessage("");
    setFundStarted(false);
    if (!contractAddress) return setErrorMessage("PayChad is not deployed on this network yet.");
    if (!companyId || companyId === 0n) return setErrorMessage("Register a company first.");
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(fundAmount) || Number(fundAmount) <= 0) return setErrorMessage("Enter a valid USDC amount.");
    const amount = parseUnits(fundAmount, 6);
    if (walletUsdcBalance !== undefined && amount > walletUsdcBalance) return setErrorMessage("Your wallet does not have enough USDC.");
    try {
      const hash = await approveUsdc({ address: usdcAddress, abi: erc20Abi, functionName: "approve", args: [contractAddress, amount] });
      setPendingFundAmount(amount);
      setApproveHash(hash);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "USDC approval failed.");
    }
  }

  async function submitPayrollRun() {
    setErrorMessage("");
    setExecuteStarted(false);
    if (!contractAddress) return setErrorMessage("PayChad is not deployed on this network yet.");
    if (!companyId || companyId === 0n) return setErrorMessage("Register a company first.");
    if (!activeEmployeeIds || activeEmployeeIds.length === 0) return setErrorMessage("Add at least one active employee first.");
    if (!company || company.payrollBalance === 0n) return setErrorMessage("Fund payroll before executing a run.");
    try {
      const expectedRunId = company.nextRunId;
      const hash = await createRun({ address: contractAddress, abi: payrollAbi, functionName: "createPayrollRun", args: [companyId] });
      setPendingRunId(expectedRunId);
      setRunHash(hash);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Payroll run creation failed.");
    }
  }

  const isWrongNetwork = isConnected && chainId !== monad.id && chainId !== monadTestnet.id;
  const employeeCount = company?.employeeCount ?? 0n;
  const payrollBalance = company?.payrollBalance ?? 0n;
  const walletBalance = walletUsdcBalance ?? 0n;

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
            <article className="stat-card"><small>Payroll balance</small><strong>{formatUnits(payrollBalance, 6)} USDC</strong></article>
            <article className="stat-card"><small>Active employees</small><strong>{activeEmployeeIds?.length ?? employeeCount.toString()}</strong></article>
            <article className="stat-card"><small>Company</small><strong>{company?.name ?? "Not registered"}</strong></article>
            <article className="stat-card"><small>Wallet USDC</small><strong>{formatUnits(walletBalance, 6)}</strong></article>
          </section>

          {!companyId || companyId === 0n ? (
            <section className="panel">
              <h2>Create your company</h2>
              <p>The transaction creates an onchain company record owned by the connected wallet.</p>
              <form className="form-row" onSubmit={submitCompany}>
                <input className="text-input" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Company name" maxLength={80} />
                <button className="button button-primary" disabled={isRegistering || isRegisterPending}>{isRegistering ? "Confirm in wallet…" : isRegisterPending ? "Registering…" : "Register company"}</button>
              </form>
              {registerHash ? <p className="status">Registration submitted: {registerHash}</p> : null}
            </section>
          ) : (
            <>
              <section className="panel">
                <h2>Add an employee</h2>
                <p>Salary is stored as USDC base units. Payments are sent directly to the employee wallet during execution.</p>
                <form className="form-row" onSubmit={submitEmployee}>
                  <input className="text-input" value={employeeWallet} onChange={(event) => setEmployeeWallet(event.target.value)} placeholder="Employee wallet address" />
                  <input className="text-input" value={salary} onChange={(event) => setSalary(event.target.value)} placeholder="Monthly salary (USDC)" inputMode="decimal" />
                  <button className="button button-primary" disabled={isAddingEmployee || isEmployeePending}>{isAddingEmployee ? "Confirm in wallet…" : isEmployeePending ? "Adding…" : "Add employee"}</button>
                </form>
                {employeeHash ? <p className="status">Employee transaction: {employeeHash}</p> : null}
              </section>

              <section className="panel">
                <h2>Fund payroll</h2>
                <p>Approval is a separate ERC-20 transaction. Funding starts only after the approval is confirmed.</p>
                <form className="form-row" onSubmit={submitFunding}>
                  <input className="text-input" value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} placeholder="USDC amount" inputMode="decimal" />
                  <button className="button button-primary" disabled={isApproving || isApprovePending || isFunding || isFundPending}>{isApproving ? "Approve in wallet…" : isApprovePending ? "Approval pending…" : isFunding ? "Fund in wallet…" : isFundPending ? "Funding pending…" : "Approve & fund"}</button>
                </form>
                {approveHash ? <p className="status">Approval: {approveHash}</p> : null}
                {fundHash ? <p className="status">Funding: {fundHash}</p> : null}
              </section>

              <section className="panel">
                <h2>Execute payroll</h2>
                <p>{activeEmployeeIds?.length ?? 0} active employee{(activeEmployeeIds?.length ?? 0) === 1 ? "" : "s"} will be included. The run is created first, then execution is submitted only after confirmation.</p>
                <button className="button button-primary" disabled={isCreatingRun || isRunPending || isExecuting || isExecutePending || !activeEmployeeIds?.length} onClick={submitPayrollRun}>
                  {isCreatingRun ? "Confirm run in wallet…" : isRunPending ? "Run creation pending…" : isExecuting ? "Confirm payroll in wallet…" : isExecutePending ? "Payroll execution pending…" : "Create & execute payroll"}
                </button>
                {runHash ? <p className="status">Run creation: {runHash}</p> : null}
                {executeHash ? <p className="status">Payroll execution: {executeHash}</p> : null}
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
