import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  createWalletInvite,
  indonesianEnumErrorMap,
  listWalletInvites,
} from "@/lib/wallets";

const createInviteSchema = z.object(
  {
    email: z
      .string({ invalid_type_error: "Email harus berupa teks." })
      .trim()
      .refine(
        (val) => val === "" || z.string().email().safeParse(val).success,
        "Format email tidak valid."
      )
      .transform((val) => (val === "" ? null : val))
      .optional()
      .nullable(),
    role: z.enum(["editor", "viewer"], {
      errorMap: indonesianEnumErrorMap(
        "Peran undangan wajib dipilih.",
        "Peran undangan harus editor atau viewer."
      ),
    }),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;

    const invites = await listWalletInvites(await getDb(), id, user.id);
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

    const invite = await createWalletInvite(await getDb(), id, user.id, {
      email: parsed.email ? parsed.email : null,
      role: parsed.role,
    });
    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
