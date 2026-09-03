import Link from "next/link";
import { WalletButton } from "./components/WalletButton";

export default function Home() {
  return (
    <main className="site-shell">
      <nav className="topbar">
        <Link className="brand" href="/">PayChad</Link>
        <div className="nav-actions">
          <Link className="nav-link" href="/dashboard">Dashboard</Link>
          <WalletButton />
        </div>
      </nav>

      <section className="hero">
        <div className="eyebrow">MONAD-NATIVE PAYROLL</div>
        <h1>Payroll that moves<br /><span>at Monad speed.</span></h1>
        <p className="hero-copy">
          Fund once, run payroll onchain, and give every contractor a verifiable USDC payment.
          PayChad turns repetitive business payouts into a programmable workflow.
        </p>
        <div className="hero-actions">
          <WalletButton />
          <Link className="button button-ghost" href="/dashboard">Open command center</Link>
        </div>
        <div className="hero-proof">
          <div><strong>USDC</strong><span>Native settlement</span></div>
          <div><strong>MONAD</strong><span>Fast execution</span></div>
          <div><strong>ONCHAIN</strong><span>Auditable payroll</span></div>
        </div>
      </section>

      <section className="feature-grid">
        <article><span>01</span><h2>One funding flow</h2><p>Approve USDC, fund the payroll vault, and keep the financial balance onchain.</p></article>
        <article><span>02</span><h2>Batch payouts</h2><p>Create a payroll run and execute a verified employee batch without trusting an offchain balance.</p></article>
        <article><span>03</span><h2>Built for automation</h2><p>The contract emits the events the indexer and future scheduling layer need for reliable operations.</p></article>
      </section>
    </main>
  );
}
