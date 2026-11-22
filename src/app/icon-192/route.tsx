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
          background: "linear-gradient(145deg, #14532D 0%, #0F3D22 100%)",
          borderRadius: "42px",
          border: "6px solid #E5B869",
          color: "#FAF0DD",
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: 84,
          letterSpacing: "-0.04em",
        }}
      >
        <span>AK</span>
        <span style={{ color: "#E5B869" }}>.</span>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
