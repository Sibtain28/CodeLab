import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { SetupScreen } from "@/components/setup-screen";
import { WorkspaceIDE } from "@/components/workspace/workspace-ide";
import { WorkspaceSkeleton } from "@/components/workspace/workspace-skeleton";
import { demoMe, demoWorkspace, initialFiles, initialOpenTabs, peers } from "@/lib/mock/workspace";
import { missingConfig } from "@/server/config";
import { readLiveKitConfig } from "@/calls/token";
import { checkLocalCollabServer } from "@/server/collab-health";
import { AccessError, requireUser } from "@/server/dal";
import { loadWorkspace, type WorkspaceData } from "@/server/projects";

export const metadata: Metadata = {
  title: "Workspace",
};

/**
 * `/workspace/demo` is the public sample workspace (mock data, nothing saved).
 * Every other id is a real project: the session is verified and membership is
 * checked on the server before any file content is sent to the browser.
 */
async function ProjectWorkspace({ params }: { params: Promise<{ workspaceId: string }> }) {
  await connection();
  const { workspaceId } = await params;
  const missing = missingConfig();
  if (missing.length) return <SetupScreen missing={missing} />;

  const user = await requireUser(`/workspace/${workspaceId}`);
  let data: WorkspaceData;
  try {
    data = await loadWorkspace(workspaceId);
  } catch (error) {
    // Non-members get the same 404 as a missing project.
    if (error instanceof AccessError) notFound();
    throw error;
  }

  const collabUrl = process.env.COLLAB_URL?.trim() || null;
  const collabProblem = collabUrl ? await checkLocalCollabServer(collabUrl) : null;

  const files = Object.fromEntries(data.files.map((f) => [f.path, f.content]));
  const versions = Object.fromEntries(data.files.map((f) => [f.path, f.version]));
  const firstFile =
    data.files.find((f) => f.path.toLowerCase() === "readme.md")?.path ?? data.files[0]?.path;
  const others = data.members.filter((m) => !m.isYou);

  return (
    <WorkspaceIDE
      // Remount when switching projects so no state leaks between them.
      key={data.id}
      workspace={{ id: data.id, name: data.name, branch: "main", description: data.description }}
      me={{ name: user.name, handle: user.email.split("@")[0], color: "accent", role: data.role }}
      initialFiles={files}
      initialTabs={firstFile ? [firstFile] : []}
      // No live presence yet: members are listed as offline.
      peers={others.map((m) => ({
        id: m.id,
        name: m.name,
        handle: m.name.toLowerCase().replace(/\s+/g, ""),
        color: m.color,
        role: m.role,
        activity: "Member",
        file: null,
        cursor: null,
        inCall: false,
        micOn: false,
        cameraOn: false,
        status: "offline",
      }))}
      persistence={{
        projectId: data.id,
        canWrite: data.canWrite,
        versions,
        fileIds: Object.fromEntries(data.files.map((f) => [f.path, f.id])),
        userId: user.id,
        // Read at request time, so one build works in every environment.
        collabUrl,
        collabProblem,
        callsConfigured: readLiveKitConfig().ok,
      }}
    />
  );
}

async function WorkspaceRoute({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  if (workspaceId !== demoWorkspace.id) return <ProjectWorkspace params={params} />;
  return (
    <WorkspaceIDE
      key="demo"
      workspace={demoWorkspace}
      me={demoMe}
      initialFiles={initialFiles}
      initialTabs={initialOpenTabs}
      peers={peers}
    />
  );
}

// The demo is prerendered; project workspaces render per request.
export async function generateStaticParams() {
  return [{ workspaceId: demoWorkspace.id }];
}

export default function WorkspacePage({ params }: PageProps<"/workspace/[workspaceId]">) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <WorkspaceRoute params={params} />
    </Suspense>
  );
}
