import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, RefreshCw, Table2 } from 'lucide-react';
import { SHEET_TABS } from '../services/sheetSchema';
import { SheetTabName, SpreadsheetDataset } from '../types/sheets';

interface SheetsExplorerViewProps {
  dataset: SpreadsheetDataset;
  onRefresh: () => Promise<void>;
  onVerifyStructure: () => Promise<void>;
  isBusy: boolean;
}

export const SheetsExplorerView: React.FC<SheetsExplorerViewProps> = ({
  dataset,
  onRefresh,
  onVerifyStructure,
  isBusy,
}) => {
  const [activeTab, setActiveTab] = useState<SheetTabName>('PERSONAL');

  const activeDef = SHEET_TABS.find((t) => t.name === activeTab) || SHEET_TABS[0];
  const rows = dataset.rawTabs[activeTab] || [];
  const headers = rows[0] || activeDef.headers;
  const bodyRows = rows.slice(1);

  return (
    <div className="space-y-6">
      {/* Spreadsheet Connection Header */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Conectado en vivo con Google Sheets</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {dataset.spreadsheetTitle}
            </h2>
            <p className="mt-1 font-mono text-xs text-slate-500 break-all">
              ID: {dataset.spreadsheetId}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onVerifyStructure}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Table2 className="h-3.5 w-3.5" />
              <span>Verificar 13 pestañas</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
              <span>Sincronizar</span>
            </button>
            <a
              href={dataset.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
            >
              <span>Abrir en Google Sheets</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* 13-Tab Selector Strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {SHEET_TABS.map((t) => {
          const count = Math.max(0, (dataset.rawTabs[t.name]?.length || 1) - 1);
          const selected = activeTab === t.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => setActiveTab(t.name)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                selected
                  ? 'border-red-700 bg-red-50/70 text-red-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <p className="truncate font-mono text-[11px] font-semibold">{t.name}</p>
              <p className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                {count} filas
              </p>
            </button>
          );
        })}
      </div>

      {/* Raw Sheet Data Preview */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-3.5">
          <div>
            <h3 className="font-mono text-sm font-bold text-slate-900">{activeTab}</h3>
            <p className="text-xs text-slate-500">{activeDef.description}</p>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {bodyRows.length} registros · {headers.length} columnas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-slate-700">
                <th className="px-3 py-2.5 font-mono text-[11px] text-slate-400">#</th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2.5 font-mono text-[11px] font-semibold whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bodyRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400 tabular-nums">
                    {idx + 2}
                  </td>
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="max-w-xs truncate px-3 py-2 font-mono text-[11px] text-slate-800"
                      title={row[cIdx] || ''}
                    >
                      {row[cIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
              {bodyRows.length === 0 && (
                <tr>
                  <td
                    colSpan={headers.length + 1}
                    className="py-10 text-center text-slate-500"
                  >
                    Esta pestaña está creada con sus encabezados y aún no contiene registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
