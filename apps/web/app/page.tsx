export default function Home() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "72px 24px" }}>
      <p style={{ opacity: 0.6, letterSpacing: 2 }}>MONAD PAYMENTS</p>
      <h1 style={{ fontSize: "clamp(48px, 9vw, 96px)", lineHeight: 0.95, margin: "24px 0" }}>PayChad</h1>
      <p style={{ maxWidth: 620, fontSize: 22, lineHeight: 1.5, opacity: 0.8 }}>
        Fast, automated stablecoin payroll and business payouts on Monad.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
        <button style={{ padding: "14px 20px", borderRadius: 10, border: 0, cursor: "pointer" }}>Connect wallet</button>
        <a href="/dashboard" style={{ padding: "14px 20px", borderRadius: 10, border: "1px solid #333", color: "inherit", textDecoration: "none" }}>View dashboard</a>
      </div>
    </main>
  );
}
