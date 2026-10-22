"use client";

import { RouteError } from "@/components/route-error";

export default function DashboardError({ retry }: { error: unknown; retry: () => void }) {
  return <RouteError retry={retry} what="your dashboard" />;
}
