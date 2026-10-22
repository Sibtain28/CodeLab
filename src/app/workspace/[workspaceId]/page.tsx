import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkspaceIDE } from "@/components/workspace/workspace-ide";
import { demoWorkspace } from "@/lib/mock/workspace";

export const metadata: Metadata = {
  title: `${demoWorkspace.name} — Workspace`,
};

// Phase 1 ships a single mock workspace. Real workspaces will be loaded
// from the database once persistence lands.
export async function generateStaticParams() {
  return [{ workspaceId: demoWorkspace.id }];
}

export default async function WorkspacePage({ params }: PageProps<"/workspace/[workspaceId]">) {
  const { workspaceId } = await params;
  if (workspaceId !== demoWorkspace.id) notFound();

  return <WorkspaceIDE workspace={demoWorkspace} />;
}
