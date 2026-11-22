import { ImageResponse } from "next/og";
import { getDb } from "@/db";
import { formatDateID, formatIDR } from "@/lib/format";
import { getPublicSplitBillBySlug } from "@/lib/split-bills";

export const alt = "Rincian Patungan · ArusKas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function SplitBillOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await getDb();
  const bill = await getPublicSplitBillBySlug(db, slug);

  const title = bill?.title ?? "Rincian Patungan ArusKas";
  const totalText = bill ? formatIDR(bill.totalAmount) : "Patungan Publik";
  const statusText = bill
    ? `${bill.paidCount} dari ${bill.totalCount} orang sudah lunas · ${formatDateID(bill.occurredAt)}`
    : "Cek rincian tagihan & nomor rekening transfer di ArusKas.";
  const bankLine = bill?.bankName
    ? `Transfer via ${bill.bankName}${bill.accountHolder ? ` · a.n. ${bill.accountHolder}` : ""}`
    : "Dibuat dengan ArusKas — Gratis & Transparan";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 68px",
          background:
            "linear-gradient(135deg, #14532D 0%, #113B26 58%, #0D2E1D 100%)",
          color: "#FAF8F4",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: 38, fontWeight: 700, color: "#FAF0DD" }}>
            ArusKas<span style={{ color: "#E5B869" }}>.</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "#FAF0DD",
              color: "#14532D",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            Patungan / Split Bill
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "#E5B869",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {bill ? `Dibuat oleh ${bill.creatorName}` : "Rincian Patungan"}
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: "#86EFAC",
            }}
          >
            {totalText}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "2px solid rgba(229, 184, 105, 0.3)",
            paddingTop: 24,
            fontSize: 24,
            color: "#D6EAE0",
          }}
        >
          <span>{statusText}</span>
          <span style={{ color: "#E5B869", fontWeight: 600 }}>{bankLine}</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
