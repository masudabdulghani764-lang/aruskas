import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #14532D 0%, #0D2E1D 100%)",
          color: "#FAF0DD",
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: 184,
          letterSpacing: "-0.04em",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "340px",
            height: "340px",
            borderRadius: "999px",
            border: "10px solid rgba(229, 184, 105, 0.75)",
          }}
        >
          <span>AK</span>
          <span style={{ color: "#E5B869" }}>.</span>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
