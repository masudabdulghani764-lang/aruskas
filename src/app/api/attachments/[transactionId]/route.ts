import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import {
  readAttachmentBuffer,
  sanitizeAttachmentName,
} from "@/lib/attachments";
import { requireCurrentUser } from "@/lib/auth";
import { AppError, handleApiError } from "@/lib/errors";
import { getTransactionById } from "@/lib/transactions";

export async function GET(
  _request: Request,
  context: { params: Promise<{ transactionId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { transactionId } = await context.params;
    const db = getDb();

    // Verifies transaction existence (404) and viewer access on wallet or targetWallet (403).
    getTransactionById(db, transactionId, user.id);

    const row = db
      .select({
        attachmentPath: transactions.attachmentPath,
        attachmentName: transactions.attachmentName,
        attachmentMime: transactions.attachmentMime,
      })
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();

    if (!row?.attachmentPath) {
      throw new AppError(404, "Transaksi ini tidak memiliki lampiran.");
    }

    const bytes = await readAttachmentBuffer(row.attachmentPath);
    const filename = sanitizeAttachmentName(row.attachmentName ?? "lampiran");

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": row.attachmentMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
