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
          background:
            "radial-gradient(circle at 24% 22%, rgba(34, 122, 72, 0.42) 0%, rgba(34, 122, 72, 0) 68%), linear-gradient(135deg, #165B33 0%, #0B2919 100%)",
        }}
      >
        <svg
          width="180"
          height="180"
          viewBox="0 0 1024 1024"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M232 540 C350 314 570 540 742 332"
            stroke="#FAF6EE"
            strokeWidth="74"
            strokeLinecap="round"
          />
          <path
            d="M282 692 C400 466 620 692 792 484"
            stroke="#E8BC68"
            strokeWidth="74"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
