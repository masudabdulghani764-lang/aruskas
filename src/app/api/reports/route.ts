import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getFinancialReport, parseReportQueryParams } from "@/lib/reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const query = parseReportQueryParams(searchParams);

    const report = getFinancialReport(getDb(), user.id, query);
    return NextResponse.json(report);
  } catch (err) {
    return handleApiError(err);
  }
}
