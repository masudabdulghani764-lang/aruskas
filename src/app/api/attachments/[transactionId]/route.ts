import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { transactionAttachments, transactions } from "@/db/schema";
import {
  buildContentDisposition,
  decodeAttachmentFromDb,
  readAttachmentBuffer,
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
    const db = await getDb();

    // Verifies transaction existence (404) and viewer access on wallet or targetWallet (403).
    await getTransactionById(db, transactionId, user.id);

    const [[row], [blobRow]] = await Promise.all([
      db
        .select({
          attachmentPath: transactions.attachmentPath,
          attachmentName: transactions.attachmentName,
          attachmentMime: transactions.attachmentMime,
        })
        .from(transactions)
        .where(eq(transactions.id, transactionId))
        .limit(1),
      db
        .select({ data: transactionAttachments.data })
        .from(transactionAttachments)
        .where(eq(transactionAttachments.transactionId, transactionId))
        .limit(1),
    ]);

    if (!row?.attachmentPath) {
      throw new AppError(404, "Transaksi ini tidak memiliki lampiran.");
    }

    let bytes: Uint8Array;
    if (blobRow?.data) {
      bytes = decodeAttachmentFromDb(blobRow.data);
    } else if (!row.attachmentPath.startsWith("db:")) {
      bytes = await readAttachmentBuffer(row.attachmentPath);
    } else {
      throw new AppError(404, "Berkas lampiran tidak ditemukan.");
    }

    const contentDisposition = buildContentDisposition(
      row.attachmentName ?? "lampiran",
      "inline"
    );

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": row.attachmentMime ?? "application/octet-stream",
        "Content-Disposition": contentDisposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
