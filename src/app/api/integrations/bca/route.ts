import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { parseJsonBody, requireCurrentUser } from "@/lib/auth";
import {
  getBcaIntegration,
  upsertBcaIntegration,
} from "@/lib/bca-integration";
import { handleApiError } from "@/lib/errors";
import { listUserWallets } from "@/lib/wallets";

const upsertSchema = z.object(
  {
    walletId: z
      .string({
        required_error: "Dompet tujuan BCA wajib dipilih.",
        invalid_type_error: "Dompet tujuan BCA harus berupa teks.",
      })
      .trim()
      .min(1, "Dompet tujuan BCA wajib dipilih."),
    isActive: z
      .boolean({ invalid_type_error: "Status aktif harus berupa boolean." })
      .optional(),
    autoCategorize: z
      .boolean({
        invalid_type_error: "Auto-kategori harus berupa boolean.",
      })
      .optional(),
    providerWalletMap: z.record(z.string(), z.string()).optional(),
  },
  { invalid_type_error: "Format data permintaan tidak valid." }
);

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const db = await getDb();
    const [{ integration, logs }, allWallets] = await Promise.all([
      getBcaIntegration(db, user.id),
      listUserWallets(db, user.id),
    ]);
    const writableWallets = allWallets.filter(
      (w) => w.role === "owner" || w.role === "editor"
    );

    return NextResponse.json({
      integration,
      logs,
      writableWallets,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const rawBody = await parseJsonBody(request);
    const parsed = upsertSchema.parse(rawBody);
    const db = await getDb();

    const result = await upsertBcaIntegration(db, user.id, {
      walletId: parsed.walletId,
      isActive: parsed.isActive,
      autoCategorize: parsed.autoCategorize,
      providerWalletMap: parsed.providerWalletMap,
    });

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
