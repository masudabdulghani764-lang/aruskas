import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArusKas — Laporan Keuangan Pribadi & Keluarga",
    short_name: "ArusKas",
    description:
      "Kelola arus kas pribadi, dompet bersama keluarga, anggaran bulanan, patungan, dan auto-catat 12 bank & e-wallet Indonesia.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F5E9D3",
    theme_color: "#14532D",
    lang: "id",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
