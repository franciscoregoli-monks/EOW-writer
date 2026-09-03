import { getQaJob } from "../../../../../src/jobQueue.mjs";
import { toCanonicalHtml } from "../../../../../src/report.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { id } = await params;
  const job = getQaJob(id);
  if (!job) {
    return Response.json({ error: "QA run not found" }, { status: 404 });
  }
  if (job.status !== "complete" || !job.report) {
    return Response.json(
      { error: "QA report is not ready" },
      { status: 409 }
    );
  }
  if (!job.report.summary?.buckets) {
    return Response.json(
      { error: "HTML export requires a canonical SDR report" },
      { status: 422 }
    );
  }

  return new Response(toCanonicalHtml(job.report), {
    headers: {
      "Content-Disposition": `attachment; filename="adobe-qa-${id}.html"`,
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
