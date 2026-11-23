export const PROVIDER_META: Record<
  string,
  {
    appName: string;
    gmailFrom: string;
    sampleSubject: string;
    sampleText: string;
  }
> = {
  bca: {
    appName: "myBCA / BCA mobile",
    gmailFrom: "bca.co.id",
    sampleSubject: "Notifikasi Transfer Masuk myBCA",
    sampleText:
      "Anda menerima transfer sebesar Rp 2.500.000,00 dari PT NUSANTARA DIGITAL ke rekening BCA Anda pada tanggal 21/11/2026. No. Ref: BCA2026112101",
  },
  mandiri: {
    appName: "Livin' by Mandiri",
    gmailFrom: "bankmandiri.co.id",
    sampleSubject: "Livin' by Mandiri - Transaksi QRIS Berhasil",
    sampleText:
      "Pembayaran QRIS Livin' by Mandiri di KOPI KENANGAN SUDIRMAN sebesar Rp 42.000 pada 21/11/2026 berhasil. Ref: MDR2026112102",
  },
  bri: {
    appName: "BRImo BRI",
    gmailFrom: "bri.co.id",
    sampleSubject: "Transaksi BRImo Berhasil",
    sampleText:
      "Pembayaran BRIVA TOKOPEDIA melalui BRImo sebesar Rp 275.000,00 pada 21/11/2026 berhasil. Ref: BRI2026112105",
  },
  bni: {
    appName: "wondr by BNI / BNI Mobile",
    gmailFrom: "bni.co.id",
    sampleSubject: "Notifikasi Transaksi wondr by BNI",
    sampleText:
      "Transfer ke BUDI SANTOSO melalui wondr BNI sebesar Rp 185.000 pada 21/11/2026 berhasil. Ref: BNI2026112106",
  },
  blu: {
    appName: "blu by BCA Digital",
    gmailFrom: "bcadigital.co.id",
    sampleSubject: "Notifikasi Transaksi blu by BCA",
    sampleText:
      "Pembayaran QRIS blu by BCA di ALFAMART KEMANG sebesar Rp 54.000 pada 21/11/2026 berhasil. Ref: BLU2026112107",
  },
  jago: {
    appName: "Bank Jago",
    gmailFrom: "jago.com",
    sampleSubject: "Bank Jago - Transaksi Berhasil",
    sampleText:
      "Kamu bayar QRIS Bank Jago di FORE COFFEE sebesar Rp 39.000 pada 21/11/2026 berhasil. Ref: JGO2026112108",
  },
  seabank: {
    appName: "SeaBank",
    gmailFrom: "seabank.co.id",
    sampleSubject: "SeaBank - Dana Masuk",
    sampleText:
      "Transfer masuk SeaBank sebesar Rp 750.000 dari ANDI PRATAMA pada 21/11/2026 berhasil. No. Ref: SEA2026112104",
  },
  bsi: {
    appName: "BYOND by BSI",
    gmailFrom: "bankbsi.co.id",
    sampleSubject: "Notifikasi BYOND by BSI",
    sampleText:
      "Pembayaran QRIS BYOND BSI di WARUNG SATE KHAS sebesar Rp 88.000 pada 21/11/2026 berhasil. Ref: BSI2026112109",
  },
  gopay: {
    appName: "GoPay / Gojek",
    gmailFrom: "gopay OR gojek.com",
    sampleSubject: "Notifikasi GoPay",
    sampleText:
      "Kamu bayar Rp 68.500 pakai GoPay QRIS di WARUNG PADANG SEDERHANA pada 21/11/2026 berhasil. Ref: GPY2026112103",
  },
  shopeepay: {
    appName: "ShopeePay / Shopee",
    gmailFrom: "shopee.co.id OR shopeepay",
    sampleSubject: "Pembayaran ShopeePay Berhasil",
    sampleText:
      "Pembayaran ShopeePay di INDOMARET SUDIRMAN sebesar Rp 31.500 pada 21/11/2026 berhasil. Ref: SPY2026112110",
  },
  ovo: {
    appName: "OVO",
    gmailFrom: "ovo.id",
    sampleSubject: "Notifikasi Transaksi OVO",
    sampleText:
      "Pembayaran OVO QRIS di BAKMI GM sebesar Rp 74.000 pada 21/11/2026 berhasil. Ref: OVO2026112111",
  },
  dana: {
    appName: "DANA",
    gmailFrom: "dana.id",
    sampleSubject: "Notifikasi DANA",
    sampleText:
      "Bayar pakai DANA QRIS di MIXUE sebesar Rp 28.000 pada 21/11/2026 berhasil. Ref: DNA2026112112",
  },
};

export const SAMPLE_NOTIFICATIONS = [
  {
    label: "Livin' Mandiri · QRIS",
    subject: PROVIDER_META.mandiri.sampleSubject,
    text: PROVIDER_META.mandiri.sampleText,
  },
  {
    label: "GoPay · QRIS",
    subject: PROVIDER_META.gopay.sampleSubject,
    text: PROVIDER_META.gopay.sampleText,
  },
  {
    label: "SeaBank · Masuk",
    subject: PROVIDER_META.seabank.sampleSubject,
    text: PROVIDER_META.seabank.sampleText,
  },
  {
    label: "BRImo · VA",
    subject: PROVIDER_META.bri.sampleSubject,
    text: PROVIDER_META.bri.sampleText,
  },
  {
    label: "DANA · QRIS",
    subject: PROVIDER_META.dana.sampleSubject,
    text: PROVIDER_META.dana.sampleText,
  },
  {
    label: "BCA · Transfer Masuk",
    subject: PROVIDER_META.bca.sampleSubject,
    text: PROVIDER_META.bca.sampleText,
  },
] as const;

export const SAMPLE_BCA_CSV = [
  "Informasi Rekening",
  "No. Rekening,=,8821004921",
  "Nama,=,PEMILIK REKENING BCA",
  "Periode,=,01/11/2026 - 30/11/2026",
  "",
  "Tanggal,Keterangan,Cabang,Jumlah,Saldo",
  "'02/11,TRSF E-BANKING CR 11/02 PT NUSANTARA GAJI BULANAN,0000,\"14,500,000.00 CR\",\"28,500,000.00\"",
  "'04/11,QR 004 KOPI KENANGAN SUDIRMAN,0000,\"38,000.00 DB\",\"28,462,000.00\"",
  "'07/11,TRSF E-BANKING DB BCA VA PLN LISTRIK,0000,\"625,000.00 DB\",\"27,837,000.00\"",
  "'11/11,TRSF E-BANKING DB TOKOPEDIA BELANJA RUMAH,0000,\"340,000.00 DB\",\"27,497,000.00\"",
  "'15/11,BI-FAST CR 11/15 KLIEN PROYEK WEBSITE,0000,\"3,500,000.00 CR\",\"30,997,000.00\"",
  "'PEND,QR 004 TRANSAKSI BELUM SETTLED,0000,\"19,000.00 DB\",\"30,978,000.00\"",
  "Saldo Awal,=,14,000,000.00",
].join("\n");

export function buildGmailAppsScript(
  webhookUrl: string,
  tokenPlaceholder: string,
  selectedProviderId: string
): string {
  const meta = PROVIDER_META[selectedProviderId];
  const fromFilter = meta
    ? meta.gmailFrom
    : "bca.co.id OR bankmandiri.co.id OR bri.co.id OR bni.co.id OR bcadigital.co.id OR jago.com OR seabank.co.id OR bankbsi.co.id OR gopay OR gojek.com OR ovo.id OR dana.id OR shopeepay OR shopee.co.id";
  const commentLabel = meta
    ? `email notifikasi dari ${meta.appName}`
    : "email notifikasi dari seluruh Bank & E-Wallet Indonesia";

  return `// Tempel ke https://script.google.com lalu pasang Trigger "Time-driven" tiap 5 menit
const ARUSKAS_WEBHOOK_URL = "${webhookUrl}";
const ARUSKAS_TOKEN = "${tokenPlaceholder}";

function syncNotifikasiKeuangan() {
  const labelName = "ArusKas-Synced";
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) label = GmailApp.createLabel(labelName);

  // Cari ${commentLabel}
  const query = 'from:(${fromFilter}) -label:' + labelName + ' newer_than:7d';
  const threads = GmailApp.search(query, 0, 20);

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const payload = {
        subject: msg.getSubject(),
        text: msg.getPlainBody().slice(0, 4000),
        source: "webhook_email",
        externalId: msg.getId(),
      };

      const res = UrlFetchApp.fetch(ARUSKAS_WEBHOOK_URL, {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + ARUSKAS_TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = res.getResponseCode();
      if (code === 200 || code === 201) {
        thread.addLabel(label);
      }
    }
  }
}`;
}
