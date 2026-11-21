import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { buildTransactionsCsv } from "@/lib/export";
import { getFinancialReport, parseReportQueryParams } from "@/lib/reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const query = parseReportQueryParams(searchParams);

    const report = await getFinancialReport(await getDb(), user.id, query);
    const csv = buildTransactionsCsv(report.transactions);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-aruskas-${report.from}-${report.to}.csv"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
