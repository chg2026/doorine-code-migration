import { redirect } from "next/navigation";

export default async function RehabProjectIndex({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/rehab/${projectId}/overview`);
}
