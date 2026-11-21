import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Edit3,
  FileText,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  Administrator,
  BalanceConcept,
  PendingMutation,
  PROVINCES_CLM,
  ProvinceCLM,
  SpreadsheetDataset,
  Worker,
  WorkerStatus,
} from '../types/sheets';
import {
  computeWorkerBalance,
  formatDateES,
  formatDateTimeES,
} from '../utils/calculations';
import { appendAuditMovement, appendTabRows, updateTabRow } from '../services/sheetsApi';

interface WorkersViewProps {
  dataset: SpreadsheetDataset;
  selectedExerciseId: string;
  currentAdmin: Administrator | null;
  accessToken: string;
  selectedWorkerId: string | null;
  onSelectWorker: (workerId: string | null) => void;
  onRequestMutation: (mutation: PendingMutation) => void;
  onOpenIndividualReport: (workerId: string) => void;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  dataset,
  selectedExerciseId,
  currentAdmin,
  accessToken,
  selectedWorkerId,
  onSelectWorker,
  onRequestMutation,
  onOpenIndividualReport,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkerStatus | 'todos'>('activo');
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  // Worker Form State
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [provincia, setProvincia] = useState<ProvinceCLM>('Toledo');
  const [municipio, setMunicipio] = useState('');
  const [fechaIncorporacion, setFechaIncorporacion] = useState('2027-01-01');
  const [estado, setEstado] = useState<WorkerStatus>('activo');
  const [obsAdmin, setObsAdmin] = useState('');
  const [initialVacDays, setInitialVacDays] = useState(25);
  const [initialLdDays, setInitialLdDays] = useState(3);

  // Manual Balance Adjustment Modal
  const [balanceWorker, setBalanceWorker] = useState<Worker | null>(null);
  const [balConcept, setBalConcept] = useState<BalanceConcept>('vacaciones');
  const [balAdjustment, setBalAdjustment] = useState<number>(0);
  const [balReason, setBalReason] = useState<string>('');

  const adminId = currentAdmin?.admin_id || 'ADM-001';

  const openNewWorkerModal = () => {
    setEditingWorker(null);
    setNombre('');
    setApellidos('');
    setProvincia('Toledo');
    setMunicipio('');
    setFechaIncorporacion(new Date().toISOString().slice(0, 10));
    setEstado('activo');
    setObsAdmin('');
    setInitialVacDays(25);
    setInitialLdDays(3);
    setShowWorkerModal(true);
  };

  const openEditWorkerModal = (w: Worker) => {
    setEditingWorker(w);
    setNombre(w.nombre);
    setApellidos(w.apellidos);
    setProvincia(w.provincia);
    setMunicipio(w.municipio);
    setFechaIncorporacion(w.fecha_incorporacion);
    setEstado(w.estado);
    setObsAdmin(w.observaciones_administrativas);
    setShowWorkerModal(true);
  };

  const handleSaveWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    const nowIso = new Date().toISOString();

    if (editingWorker && editingWorker._rowIndex) {
      const updated: Worker = {
        ...editingWorker,
        nombre: nombre.trim().toUpperCase(),
        apellidos: apellidos.trim().toUpperCase(),
        provincia,
        municipio: municipio.trim(),
        fecha_incorporacion: fechaIncorporacion,
        estado,
        fecha_baja: estado !== 'activo' ? editingWorker.fecha_baja || nowIso.slice(0, 10) : '',
        observaciones_administrativas: obsAdmin.trim(),
      };

      onRequestMutation({
        title: `Actualizar ficha de ${updated.nombre}`,
        description: `Se actualizarán los datos administrativos de ${updated.nombre} (${updated.worker_id}) en la pestaña PERSONAL.`,
        affectedTarget: `PERSONAL (fila ${editingWorker._rowIndex})`,
        affectedCountLabel: '1 trabajador/a + 1 registro en HISTORICO',
        execute: async () => {
          await updateTabRow(
            accessToken,
            dataset.spreadsheetId,
            'PERSONAL',
            editingWorker._rowIndex!,
            [
              updated.worker_id,
              updated.nombre,
              updated.apellidos,
              updated.provincia,
              updated.municipio,
              updated.fecha_incorporacion,
              updated.estado,
              updated.fecha_alta_sistema,
              updated.fecha_baja,
              updated.observaciones_administrativas,
            ]
          );
          await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
            adminId,
            workerId: updated.worker_id,
            provinceSnapshot: updated.provincia,
            recordType: 'PERSONAL',
            recordId: updated.worker_id,
            action: 'modificacion',
            oldValues: editingWorker as unknown as Record<string, unknown>,
            newValues: updated as unknown as Record<string, unknown>,
            notes: `Modificación ficha personal (${updated.estado})`,
          });
        },
      });
      setShowWorkerModal(false);
    } else {
      const nextNum = dataset.personal.length + 1;
      const newWorkerId = `W-${String(nextNum).padStart(3, '0')}`;
      const newWorker: Worker = {
        worker_id: newWorkerId,
        nombre: nombre.trim().toUpperCase(),
        apellidos: apellidos.trim().toUpperCase(),
        provincia,
        municipio: municipio.trim(),
        fecha_incorporacion: fechaIncorporacion,
        estado,
        fecha_alta_sistema: nowIso,
        fecha_baja: '',
        observaciones_administrativas: obsAdmin.trim(),
      };

      onRequestMutation({
        title: `Alta de nuevo trabajador/a: ${newWorker.nombre}`,
        description: `Se añadirá ${newWorker.nombre} en ${newWorker.provincia} con saldos iniciales manuales para el ejercicio ${selectedExerciseId}: ${initialVacDays} días de vacaciones y ${initialLdDays} días de libre disposición (apartado 3.3).`,
        affectedTarget: 'PERSONAL + SALDOS',
        affectedCountLabel: '1 ficha personal + 2 saldos iniciales + HISTORICO',
        execute: async () => {
          await appendTabRows(accessToken, dataset.spreadsheetId, 'PERSONAL', [
            [
              newWorker.worker_id,
              newWorker.nombre,
              newWorker.apellidos,
              newWorker.provincia,
              newWorker.municipio,
              newWorker.fecha_incorporacion,
              newWorker.estado,
              newWorker.fecha_alta_sistema,
              newWorker.fecha_baja,
              newWorker.observaciones_administrativas,
            ],
          ]);

          const balVacId = `BAL-${selectedExerciseId.replace('EX-', '')}-V-${String(nextNum).padStart(3, '0')}`;
          const balLdId = `BAL-${selectedExerciseId.replace('EX-', '')}-L-${String(nextNum).padStart(3, '0')}`;
          await appendTabRows(accessToken, dataset.spreadsheetId, 'SALDOS', [
            [
              balVacId,
              newWorker.worker_id,
              selectedExerciseId,
              'vacaciones',
              initialVacDays,
              0,
              'Asignación manual por incorporación (apartado 3.3)',
              nowIso,
              adminId,
              `Incorporación ${fechaIncorporacion}`,
            ],
            [
              balLdId,
              newWorker.worker_id,
              selectedExerciseId,
              'libre_disposicion',
              initialLdDays,
              0,
              'Asignación manual por incorporación (apartado 3.3)',
              nowIso,
              adminId,
              `Incorporación ${fechaIncorporacion}`,
            ],
          ]);

          await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
            adminId,
            workerId: newWorker.worker_id,
            provinceSnapshot: newWorker.provincia,
            recordType: 'PERSONAL',
            recordId: newWorker.worker_id,
            action: 'alta',
            oldValues: null,
            newValues: {
              ...newWorker,
              saldoInicialVacaciones: initialVacDays,
              saldoInicialLD: initialLdDays,
            },
            notes: `Alta de trabajador/a y asignación manual de saldos (${initialVacDays} vac / ${initialLdDays} LD)`,
          });
        },
      });
      setShowWorkerModal(false);
    }
  };

  const handleSaveBalanceAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceWorker || !balReason.trim()) return;
    const nowIso = new Date().toISOString();
    const balId = `BAL-ADJ-${Date.now().toString().slice(-6)}`;

    onRequestMutation({
      title: `Ajuste manual de saldo (${balanceWorker.nombre})`,
      description: `Se registrará un ajuste manual de ${balAdjustment >= 0 ? '+' : ''}${balAdjustment} días en el concepto "${balConcept === 'vacaciones' ? 'Vacaciones' : 'Libre disposición'}" para el ejercicio ${selectedExerciseId}. Motivo: ${balReason.trim()}.`,
      affectedTarget: 'SALDOS',
      affectedCountLabel: '1 ajuste de saldo + 1 registro en HISTORICO',
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'SALDOS', [
          [
            balId,
            balanceWorker.worker_id,
            selectedExerciseId,
            balConcept,
            0,
            balAdjustment,
            balReason.trim(),
            nowIso,
            adminId,
            `Ajuste manual aplicado por ${currentAdmin?.nombre_visible || adminId}`,
          ],
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: balanceWorker.worker_id,
          provinceSnapshot: balanceWorker.provincia,
          recordType: 'SALDOS',
          recordId: balId,
          action: 'alta',
          oldValues: null,
          newValues: {
            balance_id: balId,
            worker_id: balanceWorker.worker_id,
            exercise_id: selectedExerciseId,
            concepto: balConcept,
            dias_asignados: 0,
            ajustes: balAdjustment,
            motivo_ajuste: balReason.trim(),
            fecha_asignacion: nowIso,
            admin_id: adminId,
          },
          notes: `Ajuste manual de saldo (${balConcept}): ${balAdjustment} días · ${balReason.trim()}`,
        });
      },
    });
    setBalanceWorker(null);
    setBalAdjustment(0);
    setBalReason('');
  };

  const handleArchiveWorker = (w: Worker) => {
    if (!w._rowIndex) return;
    const nowDate = new Date().toISOString().slice(0, 10);
    onRequestMutation({
      title: `Archivar trabajador/a: ${w.nombre}`,
      description: `No se eliminará ningún registro físico (apartado 2). El trabajador pasará a estado "archivado" conservando todo su histórico, saldos e informes.`,
      affectedTarget: `PERSONAL (fila ${w._rowIndex})`,
      variant: 'danger',
      execute: async () => {
        await updateTabRow(accessToken, dataset.spreadsheetId, 'PERSONAL', w._rowIndex!, [
          w.worker_id,
          w.nombre,
          w.apellidos,
          w.provincia,
          w.municipio,
          w.fecha_incorporacion,
          'archivado',
          w.fecha_alta_sistema,
          nowDate,
          w.observaciones_administrativas,
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: w.worker_id,
          provinceSnapshot: w.provincia,
          recordType: 'PERSONAL',
          recordId: w.worker_id,
          action: 'modificacion',
          oldValues: { estado: w.estado },
          newValues: { estado: 'archivado', fecha_baja: nowDate },
          notes: 'Archivo lógico de trabajador/a conservando histórico',
        });
      },
    });
  };

  const filteredWorkers = useMemo(() => {
    return dataset.personal.filter((w) => {
      if (statusFilter !== 'todos' && w.estado !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${w.worker_id} ${w.nombre} ${w.apellidos} ${w.provincia} ${w.municipio}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [dataset.personal, statusFilter, search]);

  // Individual worker profile view (Section 8)
  const selectedWorker = selectedWorkerId
    ? dataset.personal.find((w) => w.worker_id === selectedWorkerId)
    : null;

  if (selectedWorker) {
    const balance = computeWorkerBalance({
      workerId: selectedWorker.worker_id,
      exerciseId: selectedExerciseId,
      saldos: dataset.saldos,
      vacaciones: dataset.vacaciones,
      libreDisposicion: dataset.libreDisposicion,
      ausencias: dataset.ausencias,
      cierres: dataset.cierres,
    });

    const workerVacs = dataset.vacaciones.filter(
      (v) => v.worker_id === selectedWorker.worker_id
    );
    const workerLds = dataset.libreDisposicion.filter(
      (l) => l.worker_id === selectedWorker.worker_id
    );
    const workerAbs = dataset.ausencias.filter(
      (a) => a.worker_id === selectedWorker.worker_id
    );
    const workerHistory = [...dataset.historico]
      .filter((h) => h.worker_id === selectedWorker.worker_id)
      .reverse();
    const applicableLocalHolidays = dataset.festivosLocales.filter(
      (fl) =>
        fl.exercise_id === selectedExerciseId &&
        fl.activo &&
        selectedWorker.municipio.trim() !== '' &&
        fl.municipio.trim().toLowerCase() === selectedWorker.municipio.trim().toLowerCase() &&
        fl.provincia === selectedWorker.provincia
    );

    const canViewAbsences = currentAdmin?.puede_ver_ausencias_sensibles ?? false;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onSelectWorker(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver a plantilla</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBalanceWorker(selectedWorker);
                setBalConcept('vacaciones');
                setBalAdjustment(0);
                setBalReason('');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Ajustar saldo manual</span>
            </button>
            <button
              type="button"
              onClick={() => openEditWorkerModal(selectedWorker)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Edit3 className="h-3.5 w-3.5" />
              <span>Editar ficha</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenIndividualReport(selectedWorker.worker_id)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Generar informe individual</span>
            </button>
          </div>
        </div>

        {/* Worker Header Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-mono font-medium text-slate-700">
                  {selectedWorker.worker_id}
                </span>
                <span aria-hidden="true">·</span>
                <span>{selectedWorker.provincia}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {selectedWorker.municipio || 'Municipio centro de trabajo pendiente'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="capitalize font-medium text-emerald-700">
                  {selectedWorker.estado}
                </span>
              </div>
              <h2 className="mt-1.5 text-2xl font-bold text-slate-900">
                {selectedWorker.nombre} {selectedWorker.apellidos}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Fecha de incorporación: {formatDateES(selectedWorker.fecha_incorporacion)}
                {selectedWorker.observaciones_administrativas &&
                  ` · ${selectedWorker.observaciones_administrativas}`}
              </p>
            </div>

            {balance.esProvisional && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900">
                Saldos provisionales ({balance.cierresPendientesCount} cierres pendientes)
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Vacaciones asignadas</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {balance.vacacionesTotalAsignado} d.
              </p>
              <p className="text-xs text-slate-500">
                {balance.vacacionesLibresElegibles} libres + {balance.cierresDescontados} cierres
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Vacaciones consumidas / pendientes</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-red-700 tabular-nums">
                {balance.vacacionesConsumidas} / {balance.vacacionesPendientes}
              </p>
              <p className="text-xs text-slate-500">Días hábiles</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Libre disposición asignado</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {balance.ldTotalAsignado} d.
              </p>
              <p className="text-xs text-slate-500">Contador independiente</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">LD consumido / pendiente</p>
              <p className="mt-1 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                {balance.ldConsumidos} / {balance.ldPendientes}
              </p>
              <p className="text-xs text-slate-500">Días de libre disposición</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Periods */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Periodos de vacaciones y libre disposición
              </h3>
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {[
                ...workerVacs.map((v) => ({
                  id: v.vacation_id,
                  tipo: v.tipo === 'cierre' ? 'Cierre confederal' : 'Vacaciones',
                  inicio: v.fecha_inicio,
                  fin: v.fecha_fin,
                  dias: `${v.dias_habiles_calculados} háb.`,
                  estado: v.estado,
                  obs: v.observaciones,
                })),
                ...workerLds.map((l) => ({
                  id: l.leave_id,
                  tipo: 'Libre disposición',
                  inicio: l.fecha_inicio,
                  fin: l.fecha_fin,
                  dias: `${l.dias_descontados} d.`,
                  estado: l.estado,
                  obs: l.observaciones,
                })),
              ].map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 px-6 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {row.tipo}{' '}
                      <span className="font-mono font-normal text-slate-400">({row.id})</span>
                    </p>
                    <p className="text-slate-500">{row.obs || 'Sin observaciones'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-slate-900 tabular-nums">
                      {formatDateES(row.inicio)} – {formatDateES(row.fin)}
                    </p>
                    <p className="text-slate-500">
                      {row.dias} · <span className="capitalize">{row.estado}</span>
                    </p>
                  </div>
                </div>
              ))}
              {workerVacs.length === 0 && workerLds.length === 0 && (
                <div className="px-6 py-8 text-center text-slate-500">
                  No hay periodos registrados para este trabajador.
                </div>
              )}
            </div>
          </section>

          {/* Local Holidays & Applicable Calendar */}
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Calendario individual aplicable ({selectedExerciseId.replace('EX-', '')})
              </h3>
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div>
                <p className="font-semibold text-slate-800 mb-2">
                  Festivos locales ({selectedWorker.municipio || 'Municipio sin asignar'})
                </p>
                {applicableLocalHolidays.length > 0 ? (
                  <ul className="space-y-1.5">
                    {applicableLocalHolidays.map((fl) => (
                      <li
                        key={fl.local_holiday_id}
                        className="flex justify-between border-b border-slate-100 pb-1"
                      >
                        <span className="text-slate-700">{fl.nombre}</span>
                        <span className="font-mono text-slate-900">{formatDateES(fl.fecha)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-amber-700">
                    Pendiente de asignar municipio de centro de trabajo y sus 2 festivos locales en
                    Calendarios.
                  </p>
                )}
              </div>

              <div>
                <p className="font-semibold text-slate-800 mb-2">
                  Festivos nacionales y de Castilla-La Mancha ({dataset.festivos.filter((f) => f.exercise_id === selectedExerciseId && f.activo).length})
                </p>
                <div className="max-h-44 overflow-y-auto space-y-1 pr-2">
                  {dataset.festivos
                    .filter((f) => f.exercise_id === selectedExerciseId && f.activo)
                    .map((f) => (
                      <div
                        key={f.holiday_id}
                        className="flex justify-between border-b border-slate-100 py-1"
                      >
                        <span className="text-slate-700">{f.nombre}</span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {formatDateES(f.fecha)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Restricted Absences + Audit History */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Otras ausencias (acceso según permisos)
              </h3>
            </div>
            <div className="p-6 text-xs">
              {!canViewAbsences ? (
                <p className="text-slate-500">
                  Tu rol administrativo no dispone de permiso para consultar registros de ausencias
                  protegidas (Art. 9 RGPD).
                </p>
              ) : workerAbs.length === 0 ? (
                <p className="text-slate-500">Sin otras ausencias registradas.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {workerAbs.map((a) => (
                    <div key={a.absence_id} className="flex justify-between py-2.5">
                      <div>
                        <p className="font-semibold text-slate-900 capitalize">
                          {a.tipo_ausencia.replace('_', ' ')} ({a.absence_id})
                        </p>
                        <p className="text-slate-500">
                          {a.observaciones_minimas || 'Categoría neutra sin detalle médico'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-slate-900">
                          {formatDateES(a.fecha_inicio)} – {formatDateES(a.fecha_fin)}
                        </p>
                        <p className="text-slate-500 capitalize">{a.estado}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Histórico de movimientos individual
              </h3>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
              {workerHistory.map((h) => (
                <div key={h.movement_id} className="px-6 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900">
                      {h.record_type} · <span className="capitalize">{h.action}</span>
                    </span>
                    <span className="font-mono text-slate-400">
                      {formatDateTimeES(h.timestamp)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">{h.notes}</p>
                </div>
              ))}
              {workerHistory.length === 0 && (
                <div className="px-6 py-8 text-center text-slate-500">
                  Sin movimientos individuales registrados.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nombre, provincia o municipio..."
              className="w-64 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-red-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
            {(['activo', 'inactivo', 'archivado', 'todos'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-3 py-1.5 font-medium capitalize transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openNewWorkerModal}
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Alta trabajador/a</span>
        </button>
      </div>

      {/* Master Workers Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Trabajador/a</th>
                <th className="px-4 py-3 font-semibold">Provincia</th>
                <th className="px-4 py-3 font-semibold">Municipio centro</th>
                <th className="px-4 py-3 font-semibold text-right">Vac. libres / total</th>
                <th className="px-4 py-3 font-semibold text-right">Vac. pend.</th>
                <th className="px-4 py-3 font-semibold text-right">LD pend.</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredWorkers.map((w) => {
                const bal = computeWorkerBalance({
                  workerId: w.worker_id,
                  exerciseId: selectedExerciseId,
                  saldos: dataset.saldos,
                  vacaciones: dataset.vacaciones,
                  libreDisposicion: dataset.libreDisposicion,
                  ausencias: dataset.ausencias,
                  cierres: dataset.cierres,
                });
                return (
                  <tr key={w.worker_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-slate-500">{w.worker_id}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onSelectWorker(w.worker_id)}
                        className="font-semibold text-slate-900 hover:text-red-700 hover:underline text-left"
                      >
                        {w.nombre} {w.apellidos}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{w.provincia}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {w.municipio || (
                        <span className="text-amber-700">Pendiente asignar</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums">
                      {bal.vacacionesLibresElegibles} / {bal.vacacionesTotalAsignado}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {bal.vacacionesPendientes}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {bal.ldPendientes}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      <span
                        className={
                          w.estado === 'activo'
                            ? 'text-emerald-700 font-medium'
                            : 'text-slate-500'
                        }
                      >
                        {w.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectWorker(w.worker_id)}
                          className="text-red-700 font-medium hover:underline"
                        >
                          Ficha
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditWorkerModal(w)}
                          className="text-slate-600 hover:text-slate-900"
                          title="Editar datos"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        {w.estado !== 'archivado' && (
                          <button
                            type="button"
                            onClick={() => handleArchiveWorker(w)}
                            className="text-slate-400 hover:text-red-700"
                            title="Archivar sin borrar"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredWorkers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-500">
                    No hay trabajadores que coincidan con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Worker Modal */}
      {showWorkerModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSaveWorker}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingWorker
                  ? `Editar trabajador/a · ${editingWorker.worker_id}`
                  : 'Alta de nuevo trabajador/a'}
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Nombre (tal como consta) *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Apellidos (opcional)
                  </label>
                  <input
                    type="text"
                    value={apellidos}
                    onChange={(e) => setApellidos(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Provincia *</label>
                  <select
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value as ProvinceCLM)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    {PROVINCES_CLM.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Municipio del centro de trabajo
                  </label>
                  <input
                    type="text"
                    value={municipio}
                    onChange={(e) => setMunicipio(e.target.value)}
                    placeholder="Ej. Albacete, Talavera de la Reina..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fecha de incorporación *
                  </label>
                  <input
                    type="date"
                    required
                    value={fechaIncorporacion}
                    onChange={(e) => setFechaIncorporacion(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as WorkerStatus)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                    <option value="archivado">Archivado</option>
                  </select>
                </div>
              </div>

              {!editingWorker && (
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Vacaciones asignadas manuales (ap. 3.3)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={initialVacDays}
                      onChange={(e) => setInitialVacDays(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Libre disposición asignado manual
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      value={initialLdDays}
                      onChange={(e) => setInitialLdDays(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-slate-900"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Observaciones administrativas
                </label>
                <textarea
                  rows={2}
                  value={obsAdmin}
                  onChange={(e) => setObsAdmin(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowWorkerModal(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
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

      {/* Manual Balance Adjustment Modal */}
      {balanceWorker && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSaveBalanceAdjustment}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Ajuste manual de saldo · {balanceWorker.nombre}
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Concepto</label>
                <select
                  value={balConcept}
                  onChange={(e) => setBalConcept(e.target.value as BalanceConcept)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  <option value="vacaciones">Vacaciones</option>
                  <option value="libre_disposicion">Libre disposición</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Días de ajuste (positivo o negativo)
                </label>
                <input
                  type="number"
                  required
                  value={balAdjustment}
                  onChange={(e) => setBalAdjustment(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Motivo obligatorio del ajuste *
                </label>
                <input
                  type="text"
                  required
                  value={balReason}
                  onChange={(e) => setBalReason(e.target.value)}
                  placeholder="Ej. Incorporación parcial, ajuste acuerdo..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setBalanceWorker(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Registrar ajuste
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
