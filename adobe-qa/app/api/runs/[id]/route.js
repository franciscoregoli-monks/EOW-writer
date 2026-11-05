import { getQaJob } from "../../../../src/jobQueue.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id } = await params;
  const job = getQaJob(id);
  if (!job) {
    return Response.json({ error: "QA run not found" }, { status: 404 });
  }
  return Response.json({
    run: {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      report: job.report,
    },
  });
}
