import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { SetupScreen } from "@/components/setup-screen";
import { missingConfig } from "@/server/config";
import { requireUser } from "@/server/dal";
import { listProjects } from "@/server/projects";
import type { ProjectSummary } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Dashboard",
};

/** Request-time data: verified session + the user's own projects. */
async function Dashboard() {
  await connection();
  const missing = missingConfig();
  if (missing.length) return <SetupScreen missing={missing} />;

  const user = await requireUser("/dashboard");
  let projects: ProjectSummary[] = [];
  let loadError = false;
  try {
    projects = await listProjects(user);
  } catch (error) {
    console.error("Failed to load projects", error);
    loadError = true;
  }
  return <DashboardView user={{ name: user.name, email: user.email }} projects={projects} loadError={loadError} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}
