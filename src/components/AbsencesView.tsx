import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Lock, Plus, ShieldAlert } from 'lucide-react';
import {
  AbsenceCategory,
  AbsenceRecord,
  Administrator,
  DiscountRule,
  PendingMutation,
  RecordStatus,
  SpreadsheetDataset,
} from '../types/sheets';
import {
  detectWorkerOverlaps,
  eachDateISO,
  formatDateES,
} from '../utils/calculations';
import { appendAuditMovement, appendTabRows, updateTabRow } from '../services/sheetsApi';

interface AbsencesViewProps {
  dataset: SpreadsheetDataset;
  currentAdmin: Administrator | null;
  accessToken: string;
  onRequestMutation: (mutation: PendingMutation) => void;
}

const ABSENCE_LABELS: Record<AbsenceCategory, string> = {
  ausencia: 'Ausencia (categoría neutra / IT sin diagnóstico)',
  permiso_retribuido: 'Permiso retribuido',
  permiso_no_retribuido: 'Permiso no retribuido',
  otra_ausencia: 'Otra ausencia',
};

export const AbsencesView: React.FC<AbsencesViewProps> = ({
  dataset,
  currentAdmin,
  accessToken,
  onRequestMutation,
}) => {
  const canView = currentAdmin?.puede_ver_ausencias_sensibles ?? false;
  const adminId = currentAdmin?.admin_id || 'ADM-001';

  const activeWorkers = useMemo(
    () => dataset.personal.filter((w) => w.estado === 'activo'),
    [dataset.personal]
  );
  const workerMap = useMemo(
    () => new Map(dataset.personal.map((w) => [w.worker_id, w])),
    [dataset.personal]
  );

  const [showModal, setShowModal] = useState(false);
  const [workerId, setWorkerId] = useState(activeWorkers[0]?.worker_id || 'W-001');
  const [tipo, setTipo] = useState<AbsenceCategory>('ausencia');
  const [startDate, setStartDate] = useState('2027-02-10');
  const [endDate, setEndDate] = useState('2027-02-12');
  const [afectaDisp, setAfectaDisp] = useState(true);
  const [reglaDescuento, setReglaDescuento] = useState<DiscountRule>('no_descuenta');
  const [status, setStatus] = useState<RecordStatus>('confirmado');
  const [obsMinimas, setObsMinimas] = useState('');

  const naturalDays = useMemo(() => {
    return eachDateISO(startDate, endDate).length;
  }, [startDate, endDate]);

  const overlaps = useMemo(() => {
    if (!workerId || !startDate || !endDate || startDate > endDate) return [];
    return detectWorkerOverlaps({
      workerId,
      startDate,
      endDate,
      isAbsence: true,
      vacaciones: dataset.vacaciones,
      libreDisposicion: dataset.libreDisposicion,
      ausencias: dataset.ausencias,
    });
  }, [workerId, startDate, endDate, dataset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const w = workerMap.get(workerId);
    if (!w) return;
    const nowIso = new Date().toISOString();
    const newId = `ABS-${startDate.slice(0, 4)}-${String(dataset.ausencias.length + 1).padStart(3, '0')}`;
    const confLevel = tipo === 'ausencia' ? 'restringido' : 'normal';

    const newRec: AbsenceRecord = {
      absence_id: newId,
      worker_id: workerId,
      tipo_ausencia: tipo,
      fecha_inicio: startDate,
      fecha_fin: endDate,
      dias_naturales: naturalDays,
      estado: status,
      afecta_disponibilidad: afectaDisp,
      regla_descuento: reglaDescuento,
      observaciones_minimas: obsMinimas.trim(),
      nivel_confidencialidad: confLevel,
      created_at: nowIso,
      updated_at: nowIso,
      created_by: adminId,
      updated_by: adminId,
    };

    onRequestMutation({
      title: `Registrar ausencia protegida (${w.nombre})`,
      description: `Se registrará "${ABSENCE_LABELS[tipo]}" del ${formatDateES(startDate)} al ${formatDateES(endDate)} (${naturalDays} días naturales) sin almacenar datos médicos ni diagnósticos (Art. 9 RGPD).`,
      affectedTarget: 'AUSENCIAS',
      affectedCountLabel: '1 ausencia + 1 movimiento en HISTORICO',
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'AUSENCIAS', [
          [
            newRec.absence_id,
            newRec.worker_id,
            newRec.tipo_ausencia,
            newRec.fecha_inicio,
            newRec.fecha_fin,
            newRec.dias_naturales,
            newRec.estado,
            newRec.afecta_disponibilidad ? 'TRUE' : 'FALSE',
            newRec.regla_descuento,
            newRec.observaciones_minimas,
            newRec.nivel_confidencialidad,
            newRec.created_at,
            newRec.updated_at,
            newRec.created_by,
            newRec.updated_by,
          ],
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: w.worker_id,
          provinceSnapshot: w.provincia,
          recordType: 'AUSENCIAS',
          recordId: newRec.absence_id,
          action: 'alta',
          oldValues: null,
          newValues: newRec as unknown as Record<string, unknown>,
          notes: `Alta ausencia (${tipo}) · ${formatDateES(startDate)}-${formatDateES(endDate)}`,
        });
      },
    });
    setShowModal(false);
    setObsMinimas('');
  };

  const handleCancelAbsence = (a: AbsenceRecord) => {
    if (!a._rowIndex) return;
    const w = workerMap.get(a.worker_id);
    const nowIso = new Date().toISOString();
    onRequestMutation({
      title: `Anular ausencia ${a.absence_id}`,
      description: `Se marcará la ausencia de ${w?.nombre || a.worker_id} como "anulado" conservando el identificador y su trazabilidad.`,
      affectedTarget: `AUSENCIAS (fila ${a._rowIndex})`,
      variant: 'danger',
      execute: async () => {
        await updateTabRow(accessToken, dataset.spreadsheetId, 'AUSENCIAS', a._rowIndex!, [
          a.absence_id,
          a.worker_id,
          a.tipo_ausencia,
          a.fecha_inicio,
          a.fecha_fin,
          a.dias_naturales,
          'anulado',
          a.afecta_disponibilidad ? 'TRUE' : 'FALSE',
          a.regla_descuento,
          a.observaciones_minimas,
          a.nivel_confidencialidad,
          a.created_at,
          nowIso,
          a.created_by,
          adminId,
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: a.worker_id,
          provinceSnapshot: w?.provincia || '',
          recordType: 'AUSENCIAS',
          recordId: a.absence_id,
          action: 'anulacion',
          oldValues: a as unknown as Record<string, unknown>,
          newValues: { ...a, estado: 'anulado', updated_at: nowIso },
          notes: `Anulación de ausencia ${a.absence_id}`,
        });
      },
    });
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center max-w-xl mx-auto mt-8">
        <Lock className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-4 text-lg font-semibold text-slate-900">
          Acceso restringido a ausencias protegidas
        </h2>
        <p className="mt-2 text-xs text-slate-600 leading-relaxed">
          Conforme al artículo 9 del RGPD y al apartado 5 de la ficha técnica, tu cuenta de
          administración (<span className="font-mono">{currentAdmin?.email}</span>) no tiene
          habilitado el permiso <span className="font-mono">puede_ver_ausencias_sensibles</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div className="text-xs">
            <p className="font-semibold text-slate-900">
              Protección de datos de salud (Art. 9 RGPD · Minimización de datos)
            </p>
            <p className="text-slate-600 mt-0.5">
              Las bajas por incapacidad temporal se registran bajo categoría neutra («ausencia»),
              sin almacenar diagnósticos ni motivos médicos. El dashboard general no muestra detalles.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Registrar ausencia / permiso</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Trabajador/a</th>
                <th className="px-4 py-3 font-semibold">Categoría</th>
                <th className="px-4 py-3 font-semibold">Inicio</th>
                <th className="px-4 py-3 font-semibold">Fin</th>
                <th className="px-4 py-3 font-semibold text-right">Días nat.</th>
                <th className="px-4 py-3 font-semibold">Regla saldo</th>
                <th className="px-4 py-3 font-semibold">Confidencialidad</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dataset.ausencias.map((a) => {
                const w = workerMap.get(a.worker_id);
                return (
                  <tr
                    key={a.absence_id}
                    className={a.estado === 'anulado' ? 'bg-slate-50 text-slate-400' : 'hover:bg-slate-50/70'}
                  >
                    <td className="px-4 py-3 font-mono">{a.absence_id}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {w ? `${w.nombre} ${w.apellidos}` : a.worker_id}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {a.tipo_ausencia.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {formatDateES(a.fecha_inicio)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {formatDateES(a.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {a.dias_naturales}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {a.regla_descuento.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 capitalize">{a.nivel_confidencialidad}</td>
                    <td className="px-4 py-3 capitalize">{a.estado}</td>
                    <td className="px-4 py-3 text-right">
                      {a.estado !== 'anulado' && (
                        <button
                          type="button"
                          onClick={() => handleCancelAbsence(a)}
                          className="text-slate-400 hover:text-red-700"
                          title="Anular"
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {dataset.ausencias.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    No hay ausencias ni permisos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Registrar ausencia o permiso (sin datos médicos)
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Trabajador/a *</label>
                  <select
                    value={workerId}
                    onChange={(e) => setWorkerId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    {activeWorkers.map((w) => (
                      <option key={w.worker_id} value={w.worker_id}>
                        {w.nombre} {w.apellidos} ({w.provincia})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tipo *</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as AbsenceCategory)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="ausencia">Ausencia (categoría neutra / IT)</option>
                    <option value="permiso_retribuido">Permiso retribuido</option>
                    <option value="permiso_no_retribuido">Permiso no retribuido</option>
                    <option value="otra_ausencia">Otra ausencia</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Fecha inicio *</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (e.target.value > endDate) setEndDate(e.target.value);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Fecha fin *</label>
                  <input
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Regla de descuento</label>
                  <select
                    value={reglaDescuento}
                    onChange={(e) => setReglaDescuento(e.target.value as DiscountRule)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="no_descuenta">No descuenta saldo</option>
                    <option value="descuenta_vacaciones">Descuenta de vacaciones</option>
                    <option value="descuenta_ld">Descuenta de libre disposición</option>
                    <option value="configurable">Pendiente / Configurable</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as RecordStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="confirmado">Confirmado</option>
                    <option value="planificada">Planificada</option>
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={afectaDisp}
                  onChange={(e) => setAfectaDisp(e.target.checked)}
                />
                <span>Afecta a la disponibilidad del equipo en calendario ({naturalDays} días naturales)</span>
              </label>

              {overlaps.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-1.5 text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Control de solapes y Art. 38.3 ET</span>
                  </div>
                  {overlaps.map((ov) => (
                    <p key={ov.recordId}>{ov.message}</p>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Observaciones mínimas (no incluir diagnósticos ni motivos médicos)
                </label>
                <input
                  type="text"
                  value={obsMinimas}
                  onChange={(e) => setObsMinimas(e.target.value)}
                  placeholder="Ej. Justificante entregado a administración"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
              >
                Continuar a confirmación
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
