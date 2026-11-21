import React, { useMemo, useState } from 'react';
import { CheckCircle2, Search, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AuditAction, SpreadsheetDataset } from '../types/sheets';
import { formatDateTimeES, verifyHistoryChainIntegrity } from '../utils/calculations';

interface AuditHistoryViewProps {
  dataset: SpreadsheetDataset;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({ dataset }) => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'todas'>('todas');
  const [typeFilter, setTypeFilter] = useState<string>('TODOS');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<{
    valid: boolean;
    checkedCount: number;
    brokenAtMovementId?: string;
  } | null>(null);

  const recordTypes = useMemo(() => {
    const s = new Set(dataset.historico.map((h) => h.record_type));
    return Array.from(s).sort();
  }, [dataset.historico]);

  const filtered = useMemo(() => {
    return [...dataset.historico]
      .reverse()
      .filter((h) => {
        if (actionFilter !== 'todas' && h.action !== actionFilter) return false;
        if (typeFilter !== 'TODOS' && h.record_type !== typeFilter) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          const text = `${h.movement_id} ${h.admin_id} ${h.worker_id} ${h.record_id} ${h.notes}`.toLowerCase();
          if (!text.includes(q)) return false;
        }
        return true;
      });
  }, [dataset.historico, actionFilter, typeFilter, search]);

  const handleVerifyChain = async () => {
    const res = await verifyHistoryChainIntegrity(dataset.historico);
    setChainResult(res);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Histórico inmutable y auditoría (append-only)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Solo lectura desde la interfaz ordinaria. Cada fila enlaza su huella SHA-256 con la
            fila anterior (<span className="font-mono">hash_prev</span>).
          </p>
        </div>

        <button
          type="button"
          onClick={handleVerifyChain}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <span>Verificar integridad de cadena SHA-256</span>
        </button>
      </div>

      {chainResult && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-3.5 text-xs ${
            chainResult.valid
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          {chainResult.valid ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
          ) : (
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-700" />
          )}
          <span>
            {chainResult.valid
              ? `Cadena verificada correctamente: ${chainResult.checkedCount} movimientos íntegros sin alteraciones manuales detectadas.`
              : `Alerta de integridad en movimiento ${chainResult.brokenAtMovementId} (posible edición manual externa sobre la pestaña HISTORICO).`}
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ID, trabajador, admin o nota..."
            className="w-72 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900"
          />
        </div>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as AuditAction | 'todas')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
        >
          <option value="todas">Todas las acciones</option>
          <option value="alta">Alta</option>
          <option value="modificacion">Modificación</option>
          <option value="anulacion">Anulación</option>
          <option value="inicializacion">Inicialización</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
        >
          <option value="TODOS">Todas las pestañas</option>
          {recordTypes.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-semibold">Movimiento</th>
                <th className="px-4 py-3 font-semibold">Fecha y hora</th>
                <th className="px-4 py-3 font-semibold">Admin</th>
                <th className="px-4 py-3 font-semibold">Trabajador / Prov.</th>
                <th className="px-4 py-3 font-semibold">Pestaña / ID</th>
                <th className="px-4 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 font-semibold">Notas</th>
                <th className="px-4 py-3 font-semibold text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((h) => {
                const isExpanded = expandedId === h.movement_id;
                return (
                  <React.Fragment key={h.movement_id}>
                    <tr className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono font-medium text-slate-900">
                        {h.movement_id}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                        {formatDateTimeES(h.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">{h.admin_id}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="font-mono">{h.worker_id}</span>
                        {h.province_snapshot && (
                          <span className="text-slate-400 ml-1">({h.province_snapshot})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {h.record_type} · {h.record_id}
                      </td>
                      <td className="px-4 py-3 capitalize font-medium">
                        <span
                          className={
                            h.action === 'anulacion'
                              ? 'text-red-700'
                              : h.action === 'alta'
                              ? 'text-emerald-700'
                              : 'text-slate-800'
                          }
                        >
                          {h.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-slate-600">
                        {h.notes || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(isExpanded ? null : h.movement_id)
                          }
                          className="font-medium text-red-700 hover:underline"
                        >
                          {isExpanded ? 'Ocultar' : 'Valores'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 text-[11px]">
                            <div>
                              <p className="font-semibold text-slate-700 mb-1">
                                Valores anteriores (old_values)
                              </p>
                              <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-slate-700 whitespace-pre-wrap break-all">
                                {h.old_values || '(vacío)'}
                              </pre>
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700 mb-1">
                                Valores nuevos / resultantes (new_values)
                              </p>
                              <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-slate-700 whitespace-pre-wrap break-all">
                                {h.new_values || '(vacío)'}
                              </pre>
                            </div>
                          </div>
                          <p className="mt-2 font-mono text-[11px] text-slate-500 break-all">
                            Huella hash_prev: {h.hash_prev}
                          </p>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Sin movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
