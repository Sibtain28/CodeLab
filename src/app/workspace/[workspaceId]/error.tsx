"use client";

import { RouteError } from "@/components/route-error";

export default function WorkspaceError({ retry }: { error: unknown; retry: () => void }) {
  return <RouteError retry={retry} what="this workspace" />;
}
