import React, { useMemo, useState } from 'react';
import { AlertTriangle, Ban, Calculator, Edit3, Plus } from 'lucide-react';
import {
  Administrator,
  LibreDisposicionRecord,
  PendingMutation,
  RecordStatus,
  SpreadsheetDataset,
  VacationRecord,
} from '../types/sheets';
import {
  calculateWorkingDaysForWorker,
  computeWorkerBalance,
  detectWorkerOverlaps,
  formatDateES,
} from '../utils/calculations';
import { appendAuditMovement, appendTabRows, updateTabRow } from '../services/sheetsApi';

interface VacationsViewProps {
  dataset: SpreadsheetDataset;
  selectedExerciseId: string;
  currentAdmin: Administrator | null;
  accessToken: string;
  onRequestMutation: (mutation: PendingMutation) => void;
}

export const VacationsView: React.FC<VacationsViewProps> = ({
  dataset,
  selectedExerciseId,
  currentAdmin,
  accessToken,
  onRequestMutation,
}) => {
  const [mode, setMode] = useState<'vacaciones' | 'libre_disposicion'>('vacaciones');
  const [filterWorkerId, setFilterWorkerId] = useState<string>('TODOS');
  const [showCancelled, setShowCancelled] = useState(false);

  // Form modal state
  const [showForm, setShowForm] = useState(false);
  const [editingVac, setEditingVac] = useState<VacationRecord | null>(null);
  const [editingLd, setEditingLd] = useState<LibreDisposicionRecord | null>(null);

  const activeWorkers = useMemo(
    () => dataset.personal.filter((w) => w.estado === 'activo'),
    [dataset.personal]
  );

  const [formWorkerId, setFormWorkerId] = useState<string>(
    activeWorkers[0]?.worker_id || 'W-001'
  );
  const [startDate, setStartDate] = useState('2027-07-01');
  const [endDate, setEndDate] = useState('2027-07-15');
  const [status, setStatus] = useState<RecordStatus>('planificada');
  const [notes, setNotes] = useState('');

  // Cancel modal state
  const [cancelTarget, setCancelTarget] = useState<{
    type: 'vacaciones' | 'libre_disposicion';
    vac?: VacationRecord;
    ld?: LibreDisposicionRecord;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const adminId = currentAdmin?.admin_id || 'ADM-001';
  const workerMap = useMemo(
    () => new Map(dataset.personal.map((w) => [w.worker_id, w])),
    [dataset.personal]
  );

  const formWorker = workerMap.get(formWorkerId) || activeWorkers[0];

  const liveCalc = useMemo(() => {
    if (!formWorker || !startDate || !endDate || startDate > endDate) return null;
    return calculateWorkingDaysForWorker({
      worker: formWorker,
      startDate,
      endDate,
      festivos: dataset.festivos,
      festivosLocales: dataset.festivosLocales,
      cierres: dataset.cierres,
    });
  }, [formWorker, startDate, endDate, dataset.festivos, dataset.festivosLocales, dataset.cierres]);

  const formOverlaps = useMemo(() => {
    if (!formWorker || !startDate || !endDate || startDate > endDate) return [];
    return detectWorkerOverlaps({
      workerId: formWorker.worker_id,
      startDate,
      endDate,
      excludeRecordId: editingVac?.vacation_id || editingLd?.leave_id,
      vacaciones: dataset.vacaciones,
      libreDisposicion: dataset.libreDisposicion,
      ausencias: dataset.ausencias,
    });
  }, [
    formWorker,
    startDate,
    endDate,
    editingVac,
    editingLd,
    dataset.vacaciones,
    dataset.libreDisposicion,
    dataset.ausencias,
  ]);

  const formWorkerBalance = useMemo(() => {
    if (!formWorker) return null;
    return computeWorkerBalance({
      workerId: formWorker.worker_id,
      exerciseId: selectedExerciseId,
      saldos: dataset.saldos,
      vacaciones: dataset.vacaciones,
      libreDisposicion: dataset.libreDisposicion,
      ausencias: dataset.ausencias,
      cierres: dataset.cierres,
    });
  }, [formWorker, selectedExerciseId, dataset]);

  const openNewModal = () => {
    setEditingVac(null);
    setEditingLd(null);
    setFormWorkerId(
      filterWorkerId !== 'TODOS'
        ? filterWorkerId
        : activeWorkers[0]?.worker_id || 'W-001'
    );
    const yr = selectedExerciseId.replace('EX-', '');
    setStartDate(`${yr}-07-01`);
    setEndDate(`${yr}-07-01`);
    setStatus('planificada');
    setNotes('');
    setShowForm(true);
  };

  const openEditVac = (v: VacationRecord) => {
    setMode('vacaciones');
    setEditingVac(v);
    setEditingLd(null);
    setFormWorkerId(v.worker_id);
    setStartDate(v.fecha_inicio);
    setEndDate(v.fecha_fin);
    setStatus(v.estado);
    setNotes(v.observaciones);
    setShowForm(true);
  };

  const openEditLd = (l: LibreDisposicionRecord) => {
    setMode('libre_disposicion');
    setEditingLd(l);
    setEditingVac(null);
    setFormWorkerId(l.worker_id);
    setStartDate(l.fecha_inicio);
    setEndDate(l.fecha_fin);
    setStatus(l.estado);
    setNotes(l.observaciones);
    setShowForm(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formWorker || !liveCalc) return;
    const nowIso = new Date().toISOString();
    const daysToDeduct = liveCalc.businessDays;

    if (mode === 'vacaciones') {
      if (editingVac && editingVac._rowIndex) {
        const updated: VacationRecord = {
          ...editingVac,
          worker_id: formWorker.worker_id,
          fecha_inicio: startDate,
          fecha_fin: endDate,
          dias_habiles_calculados: daysToDeduct,
          estado: status,
          observaciones: notes.trim(),
          updated_at: nowIso,
          updated_by: adminId,
        };
        onRequestMutation({
          title: `Modificar vacaciones ${updated.vacation_id}`,
          description: `Se actualizará el periodo de ${formWorker.nombre} (${formatDateES(startDate)} a ${formatDateES(endDate)}: ${daysToDeduct} días hábiles calculados).`,
          affectedTarget: `VACACIONES (fila ${editingVac._rowIndex})`,
          execute: async () => {
            await updateTabRow(
              accessToken,
              dataset.spreadsheetId,
              'VACACIONES',
              editingVac._rowIndex!,
              [
                updated.vacation_id,
                updated.worker_id,
                updated.exercise_id,
                updated.tipo,
                updated.fecha_inicio,
                updated.fecha_fin,
                updated.dias_habiles_calculados,
                updated.estado,
                updated.observaciones,
                updated.created_at,
                updated.updated_at,
                updated.created_by,
                updated.updated_by,
              ]
            );
            await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
              adminId,
              workerId: formWorker.worker_id,
              provinceSnapshot: formWorker.provincia,
              recordType: 'VACACIONES',
              recordId: updated.vacation_id,
              action: 'modificacion',
              oldValues: editingVac as unknown as Record<string, unknown>,
              newValues: updated as unknown as Record<string, unknown>,
              notes: `Modificación periodo vacaciones (${daysToDeduct} días hábiles)`,
            });
          },
        });
      } else {
        const yearNum = selectedExerciseId.replace('EX-', '');
        const newId = `VAC-${yearNum}-${String(dataset.vacaciones.length + 1).padStart(3, '0')}`;
        const newRec: VacationRecord = {
          vacation_id: newId,
          worker_id: formWorker.worker_id,
          exercise_id: liveCalc.crossesYears
            ? liveCalc.yearsInvolved.map((y) => `EX-${y}`).join('+')
            : selectedExerciseId,
          tipo: 'vacaciones',
          fecha_inicio: startDate,
          fecha_fin: endDate,
          dias_habiles_calculados: daysToDeduct,
          estado: status,
          observaciones: notes.trim(),
          created_at: nowIso,
          updated_at: nowIso,
          created_by: adminId,
          updated_by: adminId,
        };

        onRequestMutation({
          title: `Registrar vacaciones para ${formWorker.nombre}`,
          description: `Periodo del ${formatDateES(startDate)} al ${formatDateES(endDate)} con ${daysToDeduct} días hábiles descontables (excluidos fines de semana, festivos aplicables y cierres confirmados).`,
          affectedTarget: 'VACACIONES',
          affectedCountLabel: '1 periodo de vacaciones + 1 movimiento en HISTORICO',
          execute: async () => {
            await appendTabRows(accessToken, dataset.spreadsheetId, 'VACACIONES', [
              [
                newRec.vacation_id,
                newRec.worker_id,
                newRec.exercise_id,
                newRec.tipo,
                newRec.fecha_inicio,
                newRec.fecha_fin,
                newRec.dias_habiles_calculados,
                newRec.estado,
                newRec.observaciones,
                newRec.created_at,
                newRec.updated_at,
                newRec.created_by,
                newRec.updated_by,
              ],
            ]);
            await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
              adminId,
              workerId: formWorker.worker_id,
              provinceSnapshot: formWorker.provincia,
              recordType: 'VACACIONES',
              recordId: newRec.vacation_id,
              action: 'alta',
              oldValues: null,
              newValues: newRec as unknown as Record<string, unknown>,
              notes: `Alta vacaciones ${formatDateES(startDate)}-${formatDateES(endDate)} (${daysToDeduct} d. hábiles)`,
            });
          },
        });
      }
    } else {
      // Libre Disposición
      if (editingLd && editingLd._rowIndex) {
        const updated: LibreDisposicionRecord = {
          ...editingLd,
          worker_id: formWorker.worker_id,
          fecha_inicio: startDate,
          fecha_fin: endDate,
          dias_descontados: daysToDeduct,
          estado: status,
          observaciones: notes.trim(),
          updated_at: nowIso,
          updated_by: adminId,
        };
        onRequestMutation({
          title: `Modificar libre disposición ${updated.leave_id}`,
          description: `Se actualizará el registro de libre disposición de ${formWorker.nombre} (${daysToDeduct} días).`,
          affectedTarget: `LIBRE_DISPOSICION (fila ${editingLd._rowIndex})`,
          execute: async () => {
            await updateTabRow(
              accessToken,
              dataset.spreadsheetId,
              'LIBRE_DISPOSICION',
              editingLd._rowIndex!,
              [
                updated.leave_id,
                updated.worker_id,
                updated.exercise_id,
                updated.fecha_inicio,
                updated.fecha_fin,
                updated.dias_descontados,
                updated.estado,
                updated.observaciones,
                updated.created_at,
                updated.updated_at,
                updated.created_by,
                updated.updated_by,
              ]
            );
            await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
              adminId,
              workerId: formWorker.worker_id,
              provinceSnapshot: formWorker.provincia,
              recordType: 'LIBRE_DISPOSICION',
              recordId: updated.leave_id,
              action: 'modificacion',
              oldValues: editingLd as unknown as Record<string, unknown>,
              newValues: updated as unknown as Record<string, unknown>,
              notes: `Modificación libre disposición (${daysToDeduct} días)`,
            });
          },
        });
      } else {
        const yearNum = selectedExerciseId.replace('EX-', '');
        const newId = `LD-${yearNum}-${String(dataset.libreDisposicion.length + 1).padStart(3, '0')}`;
        const newRec: LibreDisposicionRecord = {
          leave_id: newId,
          worker_id: formWorker.worker_id,
          exercise_id: selectedExerciseId,
          fecha_inicio: startDate,
          fecha_fin: endDate,
          dias_descontados: daysToDeduct,
          estado: status,
          observaciones: notes.trim(),
          created_at: nowIso,
          updated_at: nowIso,
          created_by: adminId,
          updated_by: adminId,
        };
        onRequestMutation({
          title: `Registrar libre disposición para ${formWorker.nombre}`,
          description: `Periodo del ${formatDateES(startDate)} al ${formatDateES(endDate)} (${daysToDeduct} días del contador independiente de Libre Disposición).`,
          affectedTarget: 'LIBRE_DISPOSICION',
          affectedCountLabel: '1 registro LD + 1 movimiento en HISTORICO',
          execute: async () => {
            await appendTabRows(accessToken, dataset.spreadsheetId, 'LIBRE_DISPOSICION', [
              [
                newRec.leave_id,
                newRec.worker_id,
                newRec.exercise_id,
                newRec.fecha_inicio,
                newRec.fecha_fin,
                newRec.dias_descontados,
                newRec.estado,
                newRec.observaciones,
                newRec.created_at,
                newRec.updated_at,
                newRec.created_by,
                newRec.updated_by,
              ],
            ]);
            await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
              adminId,
              workerId: formWorker.worker_id,
              provinceSnapshot: formWorker.provincia,
              recordType: 'LIBRE_DISPOSICION',
              recordId: newRec.leave_id,
              action: 'alta',
              oldValues: null,
              newValues: newRec as unknown as Record<string, unknown>,
              notes: `Alta libre disposición ${formatDateES(startDate)}-${formatDateES(endDate)} (${daysToDeduct} d.)`,
            });
          },
        });
      }
    }

    setShowForm(false);
  };

  const handleConfirmCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelTarget || !cancelReason.trim()) return;
    const nowIso = new Date().toISOString();

    if (cancelTarget.type === 'vacaciones' && cancelTarget.vac && cancelTarget.vac._rowIndex) {
      const v = cancelTarget.vac;
      const w = workerMap.get(v.worker_id);
      const updated: VacationRecord = {
        ...v,
        estado: 'anulado',
        observaciones: `${v.observaciones ? v.observaciones + ' | ' : ''}ANULADO: ${cancelReason.trim()}`,
        updated_at: nowIso,
        updated_by: adminId,
      };
      onRequestMutation({
        title: `Anular ${v.tipo === 'cierre' ? 'cierre individual' : 'vacaciones'} (${v.vacation_id})`,
        description: `El registro conservará su identificador y pasará a estado "anulado" sin borrarse físicamente. Motivo: ${cancelReason.trim()}.`,
        affectedTarget: `VACACIONES (fila ${v._rowIndex})`,
        variant: 'danger',
        execute: async () => {
          await updateTabRow(accessToken, dataset.spreadsheetId, 'VACACIONES', v._rowIndex!, [
            updated.vacation_id,
            updated.worker_id,
            updated.exercise_id,
            updated.tipo,
            updated.fecha_inicio,
            updated.fecha_fin,
            updated.dias_habiles_calculados,
            updated.estado,
            updated.observaciones,
            updated.created_at,
            updated.updated_at,
            updated.created_by,
            updated.updated_by,
          ]);
          await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
            adminId,
            workerId: v.worker_id,
            provinceSnapshot: w?.provincia || '',
            recordType: 'VACACIONES',
            recordId: v.vacation_id,
            action: 'anulacion',
            oldValues: v as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
            notes: `Anulación (${v.tipo}): ${cancelReason.trim()}`,
          });
        },
      });
    } else if (
      cancelTarget.type === 'libre_disposicion' &&
      cancelTarget.ld &&
      cancelTarget.ld._rowIndex
    ) {
      const l = cancelTarget.ld;
      const w = workerMap.get(l.worker_id);
      const updated: LibreDisposicionRecord = {
        ...l,
        estado: 'anulado',
        observaciones: `${l.observaciones ? l.observaciones + ' | ' : ''}ANULADO: ${cancelReason.trim()}`,
        updated_at: nowIso,
        updated_by: adminId,
      };
      onRequestMutation({
        title: `Anular libre disposición (${l.leave_id})`,
        description: `El registro quedará marcado como "anulado" con trazabilidad completa. Motivo: ${cancelReason.trim()}.`,
        affectedTarget: `LIBRE_DISPOSICION (fila ${l._rowIndex})`,
        variant: 'danger',
        execute: async () => {
          await updateTabRow(
            accessToken,
            dataset.spreadsheetId,
            'LIBRE_DISPOSICION',
            l._rowIndex!,
            [
              updated.leave_id,
              updated.worker_id,
              updated.exercise_id,
              updated.fecha_inicio,
              updated.fecha_fin,
              updated.dias_descontados,
              updated.estado,
              updated.observaciones,
              updated.created_at,
              updated.updated_at,
              updated.created_by,
              updated.updated_by,
            ]
          );
          await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
            adminId,
            workerId: l.worker_id,
            provinceSnapshot: w?.provincia || '',
            recordType: 'LIBRE_DISPOSICION',
            recordId: l.leave_id,
            action: 'anulacion',
            oldValues: l as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
            notes: `Anulación libre disposición: ${cancelReason.trim()}`,
          });
        },
      });
    }

    setCancelTarget(null);
    setCancelReason('');
  };

  const visibleVacations = useMemo(() => {
    return dataset.vacaciones
      .filter((v) => {
        if (!showCancelled && v.estado === 'anulado') return false;
        if (filterWorkerId !== 'TODOS' && v.worker_id !== filterWorkerId) return false;
        return v.exercise_id.includes(selectedExerciseId);
      })
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  }, [dataset.vacaciones, showCancelled, filterWorkerId, selectedExerciseId]);

  const visibleLds = useMemo(() => {
    return dataset.libreDisposicion
      .filter((l) => {
        if (!showCancelled && l.estado === 'anulado') return false;
        if (filterWorkerId !== 'TODOS' && l.worker_id !== filterWorkerId) return false;
        return l.exercise_id === selectedExerciseId;
      })
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  }, [dataset.libreDisposicion, showCancelled, filterWorkerId, selectedExerciseId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('vacaciones')}
              className={`rounded-md px-3.5 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                mode === 'vacaciones'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vacaciones y cierres ({visibleVacations.length})
            </button>
            <button
              type="button"
              onClick={() => setMode('libre_disposicion')}
              className={`rounded-md px-3.5 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                mode === 'libre_disposicion'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Libre disposición ({visibleLds.length})
            </button>
          </div>

          <select
            value={filterWorkerId}
            onChange={(e) => setFilterWorkerId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800"
          >
            <option value="TODOS">Todos los trabajadores</option>
            {dataset.personal.map((w) => (
              <option key={w.worker_id} value={w.worker_id}>
                {w.nombre} {w.apellidos} ({w.provincia})
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="rounded border-slate-300 text-red-700"
            />
            <span>Mostrar anulados</span>
          </label>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>
            {mode === 'vacaciones'
              ? 'Registrar vacaciones'
              : 'Registrar libre disposición'}
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          {mode === 'vacaciones' ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Trabajador/a</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Inicio</th>
                  <th className="px-4 py-3 font-semibold">Fin</th>
                  <th className="px-4 py-3 font-semibold text-right">Días hábiles</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Observaciones</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleVacations.map((v) => {
                  const w = workerMap.get(v.worker_id);
                  const isCancelled = v.estado === 'anulado';
                  return (
                    <tr
                      key={v.vacation_id}
                      className={isCancelled ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/70'}
                    >
                      <td className="px-4 py-3 font-mono">{v.vacation_id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {w ? `${w.nombre} ${w.apellidos}` : v.worker_id}
                        <span className="ml-1.5 font-normal text-slate-400">
                          {w?.provincia}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {v.tipo === 'cierre' ? 'Cierre confederal' : 'Vacaciones'}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatDateES(v.fecha_inicio)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatDateES(v.fecha_fin)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                        {v.dias_habiles_calculados}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        <span
                          className={
                            isCancelled
                              ? 'text-red-700'
                              : 'text-emerald-700 font-medium'
                          }
                        >
                          {v.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">{v.observaciones || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!isCancelled && (
                          <div className="inline-flex items-center gap-2">
                            {v.tipo !== 'cierre' && (
                              <button
                                type="button"
                                onClick={() => openEditVac(v)}
                                className="text-slate-600 hover:text-slate-900"
                                title="Modificar"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setCancelTarget({ type: 'vacaciones', vac: v })
                              }
                              className="text-slate-400 hover:text-red-700"
                              title="Anular con motivo"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleVacations.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      No hay periodos de vacaciones registrados en este ejercicio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-4 py-3 font-semibold">ID</th>
                  <th className="px-4 py-3 font-semibold">Trabajador/a</th>
                  <th className="px-4 py-3 font-semibold">Inicio</th>
                  <th className="px-4 py-3 font-semibold">Fin</th>
                  <th className="px-4 py-3 font-semibold text-right">Días descontados</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Observaciones</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleLds.map((l) => {
                  const w = workerMap.get(l.worker_id);
                  const isCancelled = l.estado === 'anulado';
                  return (
                    <tr
                      key={l.leave_id}
                      className={isCancelled ? 'bg-slate-50/70 text-slate-400' : 'hover:bg-slate-50/70'}
                    >
                      <td className="px-4 py-3 font-mono">{l.leave_id}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {w ? `${w.nombre} ${w.apellidos}` : l.worker_id}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatDateES(l.fecha_inicio)}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {formatDateES(l.fecha_fin)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                        {l.dias_descontados}
                      </td>
                      <td className="px-4 py-3 capitalize">{l.estado}</td>
                      <td className="px-4 py-3 max-w-xs truncate">{l.observaciones || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {!isCancelled && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditLd(l)}
                              className="text-slate-600 hover:text-slate-900"
                              title="Modificar"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCancelTarget({ type: 'libre_disposicion', ld: l })
                              }
                              className="text-slate-400 hover:text-red-700"
                              title="Anular"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visibleLds.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      No hay días de libre disposición registrados en este ejercicio.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Vacation or LD Modal with Live Working-Day Calculator */}
      {showForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmitForm}
            className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {mode === 'vacaciones'
                  ? editingVac
                    ? `Modificar vacaciones (${editingVac.vacation_id})`
                    : 'Registrar periodo o día de vacaciones'
                  : editingLd
                  ? `Modificar libre disposición (${editingLd.leave_id})`
                  : 'Registrar día o periodo de libre disposición'}
              </h3>
            </div>

            <div className="space-y-4 px-6 py-5 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Trabajador/a *
                  </label>
                  <select
                    value={formWorkerId}
                    onChange={(e) => setFormWorkerId(e.target.value)}
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
                  <label className="block font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as RecordStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="planificada">Planificada</option>
                    <option value="confirmado">Confirmada</option>
                    <option value="disfrutada">Disfrutada</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fecha inicio *
                  </label>
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
                  <label className="block font-medium text-slate-700 mb-1">
                    Fecha fin *
                  </label>
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

              {/* Automatic Working-Day Calculation Box */}
              {liveCalc && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                      <Calculator className="h-3.5 w-3.5 text-red-700" />
                      <span>Cálculo automático de días hábiles (ap. 4.3)</span>
                    </span>
                    <span className="font-mono text-lg font-bold text-red-700 tabular-nums">
                      {liveCalc.businessDays} días descontables
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 tabular-nums">
                    <span>Naturales: {liveCalc.totalCalendarDays}</span>
                    <span>· Fines de semana excl.: {liveCalc.excludedWeekends}</span>
                    <span>· Festivos gen. excl.: {liveCalc.excludedHolidays}</span>
                    <span>· Festivos locales excl.: {liveCalc.excludedLocalHolidays}</span>
                    <span>· Cierres excl.: {liveCalc.excludedClosures}</span>
                  </div>
                  {formWorkerBalance && (
                    <p className="text-slate-700 border-t border-slate-200 pt-2">
                      Saldo actual disponible del trabajador:{' '}
                      <span className="font-mono font-semibold">
                        {mode === 'vacaciones'
                          ? `${formWorkerBalance.vacacionesPendientes} días de vacaciones`
                          : `${formWorkerBalance.ldPendientes} días de libre disposición`}
                      </span>
                    </p>
                  )}
                  {liveCalc.crossesYears && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                      Aviso cruce de ejercicios ({liveCalc.yearsInvolved.join(' / ')}): regla
                      definitiva pendiente de validación (ap. 3.4). Se calcula cada fecha con el
                      calendario de su año:{" "}
                      {Object.entries(liveCalc.splitByYear)
                        .map(([yr, d]) => `${yr}: ${d} d.`)
                        .join(', ')}
                    </div>
                  )}
                </div>
              )}

              {/* Overlap warnings */}
              {formOverlaps.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 space-y-1 text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Aviso de solape detectado ({formOverlaps.length})</span>
                  </div>
                  {formOverlaps.map((ov) => (
                    <p key={ov.recordId} className="text-xs">
                      {ov.message}
                    </p>
                  ))}
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Observaciones administrativas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!liveCalc || liveCalc.businessDays === 0}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                Continuar a confirmación
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleConfirmCancel}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Anular registro con trazabilidad
              </h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-xs">
              <p className="text-slate-600">
                Los registros anulados no se eliminan físicamente: conservan su identificador y
                quedan marcados como anulados con asiento en <span className="font-mono">HISTORICO</span>.
              </p>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Motivo obligatorio de la anulación *
                </label>
                <textarea
                  rows={3}
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Indica el motivo administrativo de la anulación..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cerrar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
              >
                Anular registro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
