import { ImageResponse } from "next/og";

export const alt = "ArusKas — Laporan Keuangan Pribadi & Keluarga";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
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
            "linear-gradient(135deg, #FFFFFF 0%, #FAF0DD 45%, #EDD6B4 100%)",
          color: "#1C1917",
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 44,
              fontWeight: 700,
              color: "#14532D",
              letterSpacing: "-0.02em",
            }}
          >
            ArusKas<span style={{ color: "#B45309" }}>.</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "10px 22px",
              borderRadius: 999,
              background: "#14532D",
              color: "#FAF0DD",
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            Gratis · Tanpa Iklan
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 60,
              fontWeight: 700,
              lineHeight: 1.12,
              color: "#14532D",
              letterSpacing: "-0.02em",
            }}
          >
            Kelola Arus Kas Pribadi &amp; Keluarga dengan Tenang.
          </div>
          <div
            style={{
              fontSize: 26,
              color: "#57534E",
              lineHeight: 1.4,
            }}
          >
            Auto-Catat 12 Bank &amp; E-Wallet · Smart Paste 1 Baris · Batas Aman
            Belanja Harian · Patungan WhatsApp · Laporan A4
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {[
            "BCA · Mandiri · BRI · Jago · GoPay · DANA",
            "Dompet Bersama Keluarga",
            "Split Bill Link Publik",
          ].map((pill) => (
            <div
              key={pill}
              style={{
                display: "flex",
                padding: "10px 20px",
                borderRadius: 999,
                border: "2px solid #D9C5A3",
                background: "#FFFFFF",
                color: "#14532D",
                fontSize: 20,
                fontWeight: 600,
              }}
            >
              {pill}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
