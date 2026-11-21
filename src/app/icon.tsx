import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: "112px",
          border: "14px solid #E5B869",
          color: "#FAF0DD",
          fontFamily: "Georgia, serif",
          fontWeight: 700,
          fontSize: 220,
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
