import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://aruskas-bay.vercel.app"
  ).replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/masuk",
          "/daftar",
          "/kebijakan-privasi",
          "/syarat-ketentuan",
          "/patungan/",
        ],
        disallow: [
          "/api/",
          "/dashboard",
          "/transaksi",
          "/dompet",
          "/anggaran",
          "/laporan",
          "/pengaturan",
          "/auto-bank",
          "/integrasi-bca",
          "/reset-sandi",
          "/undangan/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
