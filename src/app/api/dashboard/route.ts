import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getDashboardSummary, parseDashboardScopeQuery } from "@/lib/reports";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const scope = parseDashboardScopeQuery(searchParams);

    const summary = await getDashboardSummary(
      await getDb(),
      user.id,
      user.email,
      {
        scope,
      }
    );
    return NextResponse.json(summary);
  } catch (err) {
    return handleApiError(err);
  }
}
