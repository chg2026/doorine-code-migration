import { notFound, redirect } from "next/navigation";
import ProjectBar from "@/components/rehab/ProjectBar";
import TabNav from "@/components/rehab/TabNav";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectByCode } from "@/lib/rehab/queries";

export const dynamic = "force-dynamic";

export default async function RehabProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const code = decodeURIComponent(projectId);
  const project = await loadProjectByCode(user.companyId, code);
  if (!project) notFound();
  return (
    <>
      <ProjectBar project={project} />
      <TabNav projectCode={project.code} />
      {children}
    </>
  );
}
