import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { createWalletInvite, listWalletInvites } from "@/lib/wallets";

const createInviteSchema = z.object({
  email: z
    .union([
      z.string().trim().email("Format email tidak valid."),
      z.literal(""),
    ])
    .optional()
    .nullable(),
  role: z.enum(["editor", "viewer"], {
    required_error: "Peran undangan wajib dipilih.",
    invalid_type_error: "Peran undangan harus editor atau viewer.",
  }),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const invites = listWalletInvites(getDb(), id, user.id);
    return NextResponse.json({ invites });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = await parseJsonBody(request);
    const parsed = createInviteSchema.parse(body);

    const invite = createWalletInvite(getDb(), id, user.id, {
      email: parsed.email ? parsed.email : null,
      role: parsed.role,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
