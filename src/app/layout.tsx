import type { Metadata, Viewport } from "next";
import { Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ArusKas — Laporan Keuangan Pribadi & Keluarga",
    template: "%s | ArusKas",
  },
  description:
    "Kelola arus kas pribadi dan keluarga dengan tenang. Catat pemasukan, pengeluaran, transfer antar dompet, dompet bersama keluarga, anggaran bulanan, dan laporan siap cetak PDF & CSV.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F7F5F0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${newsreader.variable} ${plusJakartaSans.variable}`}
    >
      <body className="min-h-screen bg-[#F7F5F0] text-[#1C1917] antialiased selection:bg-[#DCFCE7] selection:text-[#14532D]">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#FFFFFF",
              border: "1px solid #E7E2D8",
              color: "#1C1917",
              borderRadius: "12px",
              fontSize: "13px",
              boxShadow: "0 4px 16px rgba(28, 25, 23, 0.06)",
            },
            classNames: {
              success: "!border-[#BBF7D0] !text-[#14532D]",
              error: "!border-[#FECACA] !text-[#B91C1C]",
              warning: "!border-[#FDE68A] !text-[#B45309]",
            },
          }}
        />
      </body>
    </html>
  );
}
