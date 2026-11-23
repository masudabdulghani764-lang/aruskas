"use client";

import React from "react";
import { AlertCircle, History, RefreshCw } from "lucide-react";
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives";
import type { BcaSyncLogView } from "@/lib/bca-integration";
import { formatDateID } from "@/lib/format";

export function SyncLogsPanel({
  logs,
  onRefresh,
}: {
  logs: BcaSyncLogView[];
  onRefresh: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#E7E2D8]">
        <div>
          <h2 className="text-base font-semibold text-[#1C1917]">
            Riwayat Sinkronisasi Otomatis &amp; Impor CSV
          </h2>
          <p className="text-xs text-[#78716C] mt-0.5">
            Menampilkan 25 aktivitas terakhir dari Webhook Email, Push HP,
            Simulator, dan Impor CSV.
          </p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Segarkan</span>
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="py-8">
          <EmptyState
            icon={<History className="h-5 w-5" />}
            title="Belum ada riwayat sinkronisasi otomatis"
            description="Coba jalankan Simulator Notifikasi atau Impor CSV Mutasi Bank untuk melihat catatan otomatis muncul di sini."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-[#EFECE4]">
          {logs.map((log) => (
            <li
              key={log.id}
              className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      log.status === "imported"
                        ? "inflow"
                        : log.status === "duplicate"
                          ? "warning"
                          : "outflow"
                    }
                  >
                    {log.status === "imported"
                      ? "Tercatat"
                      : log.status === "duplicate"
                        ? "Duplikat Dilewati"
                        : "Gagal"}
                  </Badge>
                  <span className="text-xs font-medium text-[#1C1917]">
                    {log.walletName}
                  </span>
                  <span className="text-[11px] text-[#78716C]">
                    ·{" "}
                    {log.source === "webhook_email"
                      ? "Webhook Email"
                      : log.source === "webhook_push"
                        ? "Webhook HP"
                        : log.source === "csv_import"
                          ? "Impor CSV"
                          : "Simulator"}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-[#57534E]">
                  {log.rawSnippet}
                </p>
                {log.errorMessage && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#B91C1C]">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>{log.errorMessage}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-[#78716C] tnum">
                {formatDateID(log.createdAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
