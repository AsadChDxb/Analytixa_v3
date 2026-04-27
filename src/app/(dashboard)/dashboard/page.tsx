"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

type Stat = { label: string; value: number };

export default function DashboardPage() {
  const [stats, setStats] = useState<Stat[]>([
    { label: "My Reports", value: 0 },
    { label: "My Dashboards", value: 0 },
    { label: "Shared Reports", value: 0 },
    { label: "Allowed Datasources", value: 0 },
  ]);

  useEffect(() => {
    (async () => {
      try {
        const [myReports, myDashboards, sharedReports, datasources] = await Promise.all([
          api.get("/reports/my?pageNumber=1&pageSize=1"),
          api.get("/dashboards/my?pageNumber=1&pageSize=1"),
          api.get("/reports/shared?pageNumber=1&pageSize=1"),
          api.get("/datasources/allowed?pageNumber=1&pageSize=1"),
        ]);

        setStats([
          { label: "My Reports", value: myReports.data.data.totalCount || 0 },
          { label: "My Dashboards", value: myDashboards.data.data.totalCount || 0 },
          { label: "Shared Reports", value: sharedReports.data.data.totalCount || 0 },
          { label: "Allowed Datasources", value: datasources.data.data.totalCount || 0 },
        ]);
      } catch {
        // Keep fallback dashboard stats.
      }
    })();
  }, []);

  return (
    <div className="dashboardClean stack">
      <section className="card dashboardHero burst">
        <p className="dashboardKicker">Enterprise Reports</p>
        <h2>Analytixa Dashboard</h2>
        <p className="dashboardSub">A clean reporting hub for monitoring your reports, building visual dashboards, and managing datasource access.</p>
        <div className="dashboardLaunchGrid">
          <Link href="/dashboard-builder" className="dashboardLaunchCard">
            <strong>Launch Dashboard Builder</strong>
            <span>Create KPI cards, tiles, and animated charts on a responsive canvas.</span>
          </Link>
          <Link href="/dashboards" className="dashboardLaunchCard">
            <strong>Open My Dashboards</strong>
            <span>Review saved boards, refresh live data, and continue editing any layout.</span>
          </Link>
        </div>
      </section>

      <section className="gridCards dashboardStatsGrid">
        {stats.map((s) => (
          <article key={s.label} className="card burst dashboardStatCard">
            <h3>{s.label}</h3>
            <strong>{s.value}</strong>
          </article>
        ))}
      </section>
    </div>
  );
}
