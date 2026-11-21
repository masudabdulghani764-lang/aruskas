import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import {
  parseJsonBody,
  requireCurrentUser,
  updateUserProfile,
} from "@/lib/auth";
import { handleApiError } from "@/lib/errors";

const profileSchema = z.object({
  name: z
    .string({ required_error: "Nama wajib diisi." })
    .trim()
    .min(2, "Nama minimal 2 karakter.")
    .max(100, "Nama maksimal 100 karakter."),
  monthlySavingsTarget: z
    .number({
      required_error: "Target tabungan bulanan wajib diisi.",
      invalid_type_error: "Target tabungan bulanan harus berupa angka.",
    })
    .int("Target tabungan bulanan harus berupa bilangan bulat.")
    .min(0, "Target tabungan minimal 0%.")
    .max(100, "Target tabungan maksimal 100%."),
});

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    const body = await parseJsonBody(request);
    const parsed = profileSchema.parse(body);

    const user = updateUserProfile(getDb(), currentUser.id, parsed);
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
