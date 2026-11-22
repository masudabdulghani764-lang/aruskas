import { NextResponse } from "next/server";
import { LATEST_ANDROID_APP_RELEASE } from "@/lib/app-version";

export async function GET() {
  return NextResponse.json(LATEST_ANDROID_APP_RELEASE, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
