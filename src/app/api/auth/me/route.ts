import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
