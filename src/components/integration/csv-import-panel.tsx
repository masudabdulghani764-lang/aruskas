"use client";

import React, { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Select, cn } from "@/components/ui/primitives";
import type { BcaCsvPreviewRow } from "@/lib/bca-integration";
import { formatDateID, formatIDR } from "@/lib/format";
import type { WalletWithRole } from "@/lib/wallets";
import { SAMPLE_BCA_CSV } from "./provider-meta";

export function CsvImportPanel({
  wallets,
  defaultWalletId,
  onImported,
}: {
  wallets: WalletWithRole[];
  defaultWalletId: string;
  onImported: () => Promise<void>;
}) {
  const [csvWalletId, setCsvWalletId] = useState(defaultWalletId);
  const [csvText, setCsvText] = useState("");
  const [csvPreviewRows, setCsvPreviewRows] = useState<BcaCsvPreviewRow[]>([]);
  const [csvCategories, setCsvCategories] = useState<
    Array<{ id: string; name: string; type: "income" | "expense" }>
  >([]);
  const [csvSelectedHashes, setCsvSelectedHashes] = useState<Set<string>>(
    new Set()
  );
  const [csvCategoryOverrides, setCsvCategoryOverrides] = useState<
    Record<string, string>
  >({});
  const [csvMeta, setCsvMeta] = useState<{
    skippedPending: number;
    skippedInvalid: number;
    detectedPeriod: string | null;
  } | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  async function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran file CSV maksimal 2MB.");
      return;
    }
    const content = await file.text();
    setCsvText(content);
    await handlePreviewCsv(content);
  }

  async function handlePreviewCsv(overrideText?: string) {
    const content = overrideText ?? csvText;
    if (!csvWalletId) {
      toast.error("Pilih dompet tujuan impor CSV terlebih dahulu.");
      return;
    }
    if (!content.trim()) {
      toast.error("Unggah file CSV KlikBCA/myBCA terlebih dahulu.");
      return;
    }
    setCsvBusy(true);
    try {
      const res = await fetch("/api/integrations/bca/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          walletId: csvWalletId,
          csvText: content,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal membaca file CSV mutasi bank.");
        return;
      }
      const rows = Array.isArray(data.rows)
        ? (data.rows as BcaCsvPreviewRow[])
        : [];
      setCsvPreviewRows(rows);
      setCsvCategories(
        Array.isArray(data.categories)
          ? (data.categories as Array<{
              id: string;
              name: string;
              type: "income" | "expense";
            }>)
          : []
      );
      setCsvMeta({
        skippedPending: data.skippedPending ?? 0,
        skippedInvalid: data.skippedInvalid ?? 0,
        detectedPeriod: data.detectedPeriod ?? null,
      });

      const nonDuplicateHashes = new Set(
        rows.filter((r) => !r.isDuplicate).map((r) => r.dedupeHash)
      );
      setCsvSelectedHashes(nonDuplicateHashes);

      const overrides: Record<string, string> = {};
      for (const r of rows) {
        overrides[r.dedupeHash] = r.suggestedCategoryId;
      }
      setCsvCategoryOverrides(overrides);

      toast.success(
        `Terbaca ${rows.length} mutasi (${nonDuplicateHashes.size} transaksi baru siap diimpor).`
      );
    } catch {
      toast.error("Terjadi gangguan jaringan saat memproses CSV.");
    } finally {
      setCsvBusy(false);
    }
  }

  async function handleCommitCsv() {
    const toImport = csvPreviewRows.filter((r) =>
      csvSelectedHashes.has(r.dedupeHash)
    );
    if (toImport.length === 0) {
      toast.error("Pilih minimal 1 mutasi baru untuk diimpor.");
      return;
    }
    setCsvBusy(true);
    try {
      const res = await fetch("/api/integrations/bca/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit",
          walletId: csvWalletId,
          rows: toImport.map((r) => ({
            type: r.type,
            amount: r.amount,
            title: r.title,
            occurredAt: r.occurredAt,
            paymentMethod: r.paymentMethod,
            notes: r.notes,
            dedupeKey: r.dedupeKey,
            categoryId:
              csvCategoryOverrides[r.dedupeHash] || r.suggestedCategoryId,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Gagal mengimpor mutasi CSV.");
        return;
      }
      toast.success(
        `Selesai! ${data.importedCount} transaksi diimpor (${data.duplicateCount} duplikat dilewati).`
      );
      setCsvPreviewRows([]);
      setCsvSelectedHashes(new Set());
      setCsvText("");
      await onImported();
    } catch {
      toast.error("Terjadi gangguan jaringan.");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex-1 max-w-md">
          <Select
            label="Pilih Dompet Tujuan Impor CSV"
            value={csvWalletId}
            onChange={(e) => setCsvWalletId(e.target.value)}
          >
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({formatIDR(w.balance)})
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#14532D] px-4 text-sm font-medium text-[#FFFFFF] hover:bg-[#166534] transition-colors cursor-pointer">
            <Upload className="h-4 w-4" />
            <span>Upload CSV Mutasi Bank</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="hidden"
            />
          </label>

          <Button
            type="button"
            variant="secondary"
            loading={csvBusy}
            onClick={() => {
              setCsvText(SAMPLE_BCA_CSV);
              void handlePreviewCsv(SAMPLE_BCA_CSV);
            }}
          >
            <span>Muat Contoh Mutasi CSV</span>
          </Button>
        </div>
      </div>

      {csvMeta && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#E7E2D8] bg-[#FAF8F4] px-4 py-2.5 text-xs text-[#57534E]">
          {csvMeta.detectedPeriod && (
            <span>
              Periode:{" "}
              <strong className="text-[#1C1917]">
                {csvMeta.detectedPeriod}
              </strong>
            </span>
          )}
          <span>
            Terbaca:{" "}
            <strong className="tnum text-[#1C1917]">
              {csvPreviewRows.length}
            </strong>{" "}
            baris
          </span>
          {csvMeta.skippedPending > 0 && (
            <span className="text-[#B45309]">
              {csvMeta.skippedPending} baris PEND dilewati otomatis
            </span>
          )}
        </div>
      )}

      {csvPreviewRows.length > 0 && (
        <div className="mt-5 space-y-4">
          <div className="overflow-x-auto rounded-xl border border-[#E7E2D8]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F4] border-b border-[#E7E2D8] text-[#78716C]">
                <tr>
                  <th className="px-3 py-2.5 w-9">Pilih</th>
                  <th className="px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Keterangan</th>
                  <th className="px-3 py-2.5">Kategori</th>
                  <th className="px-3 py-2.5 text-right">Nominal</th>
                  <th className="px-3 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE4]">
                {csvPreviewRows.map((row) => {
                  const checked = csvSelectedHashes.has(row.dedupeHash);
                  const matchingCats = csvCategories.filter(
                    (c) => c.type === row.type
                  );
                  return (
                    <tr
                      key={row.dedupeHash}
                      className={
                        row.isDuplicate
                          ? "bg-[#FAF8F4]/70 opacity-70"
                          : "bg-[#FFFFFF]"
                      }
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          disabled={row.isDuplicate}
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(csvSelectedHashes);
                            if (e.target.checked) next.add(row.dedupeHash);
                            else next.delete(row.dedupeHash);
                            setCsvSelectedHashes(next);
                          }}
                          className="h-4 w-4 accent-[#14532D]"
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tnum text-[#57534E]">
                        {formatDateID(row.occurredAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-[#1C1917]">
                          {row.title}
                        </p>
                        <p className="text-[11px] text-[#78716C]">
                          {row.paymentMethod}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          disabled={row.isDuplicate}
                          value={
                            csvCategoryOverrides[row.dedupeHash] ??
                            row.suggestedCategoryId
                          }
                          onChange={(e) =>
                            setCsvCategoryOverrides((prev) => ({
                              ...prev,
                              [row.dedupeHash]: e.target.value,
                            }))
                          }
                          className="h-8 rounded-lg border border-[#E7E2D8] bg-[#FFFFFF] px-2 text-xs text-[#1C1917]"
                        >
                          {matchingCats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right whitespace-nowrap font-semibold tnum",
                          row.type === "income"
                            ? "text-[#15803D]"
                            : "text-[#B91C1C]"
                        )}
                      >
                        {formatIDR(
                          row.type === "income" ? row.amount : -row.amount,
                          { signed: true }
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {row.isDuplicate ? (
                          <Badge variant="warning">Duplikat</Badge>
                        ) : (
                          <Badge variant="inflow">Baru</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#57534E]">
              <strong className="tnum text-[#1C1917]">
                {csvSelectedHashes.size}
              </strong>{" "}
              transaksi baru siap diimpor ke dompet tujuan.
            </p>
            <Button
              type="button"
              loading={csvBusy}
              disabled={csvSelectedHashes.size === 0}
              onClick={handleCommitCsv}
            >
              <span>Impor {csvSelectedHashes.size} Transaksi Terpilih</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
