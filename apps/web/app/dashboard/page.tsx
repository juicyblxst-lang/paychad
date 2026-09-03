import { DashboardClient } from "./DashboardClient";
import { HistoryPanel } from "./HistoryPanel";

export default function Dashboard() {
  return (
    <main className="dashboard-shell">
      <DashboardClient />
      <HistoryPanel />
    </main>
  );
}
