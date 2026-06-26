import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";

interface WorkspacePageProps {
  params: { id: string };
}

export default function WorkspacePage({ params }: WorkspacePageProps) {
  return <WorkspaceLayout workspaceId={params.id} />;
}
