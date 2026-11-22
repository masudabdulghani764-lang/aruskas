import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ArusKas — Laporan Keuangan Pribadi & Keluarga",
    short_name: "ArusKas",
    description:
      "Kelola arus kas pribadi, dompet bersama keluarga, anggaran bulanan, patungan, dan auto-catat 12 bank & e-wallet Indonesia.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#F5E9D3",
    theme_color: "#14532D",
    lang: "id",
    orientation: "portrait",
    categories: ["finance", "productivity"],
    icons: [
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Ringkasan Dashboard",
        short_name: "Dashboard",
        url: "/dashboard",
        icons: [{ src: "/icon-192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Buku Transaksi",
        short_name: "Transaksi",
        url: "/transaksi",
        icons: [{ src: "/icon-192", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Auto Bank & E-Wallet",
        short_name: "Auto Bank",
        url: "/auto-bank",
        icons: [{ src: "/icon-192", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
