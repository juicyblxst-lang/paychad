export default function Dashboard() {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>
      <p style={{ opacity: 0.6 }}>PAYCHAD DASHBOARD</p>
      <h1>Payroll command center</h1>
      <p style={{ opacity: 0.7 }}>Connect a wallet to register a company, add employees, fund payroll and execute payouts.</p>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 32 }}>
        {["Payroll balance", "Active employees", "Next payroll", "Recent payouts"].map((label) => (
          <article key={label} style={{ border: "1px solid #222", borderRadius: 14, padding: 20 }}><small style={{ opacity: .6 }}>{label}</small><div style={{ fontSize: 28, marginTop: 12 }}>—</div></article>
        ))}
      </section>
    </main>
  );
}
