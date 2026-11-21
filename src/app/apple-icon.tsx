import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
          borderRadius: "40px",
          border: "6px solid #E5B869",
          color: "#FAF0DD",
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: 76,
          letterSpacing: "-0.04em",
        }}
      >
        <span>AK</span>
        <span style={{ color: "#E5B869" }}>.</span>
      </div>
    ),
    { ...size }
  );
}
