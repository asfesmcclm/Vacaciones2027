import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, CheckCircle2, Plus } from 'lucide-react';
import {
  Administrator,
  ClosureReason,
  ClosureRecord,
  HolidayScope,
  PendingMutation,
  PROVINCES_CLM,
  ProvinceCLM,
  SpreadsheetDataset,
} from '../types/sheets';
import { formatDateES, getDayOfWeekUTC } from '../utils/calculations';
import { appendAuditMovement, appendTabRows, updateTabRow } from '../services/sheetsApi';

interface CalendarsViewProps {
  dataset: SpreadsheetDataset;
  selectedExerciseId: string;
  onSelectExercise: (id: string) => void;
  currentAdmin: Administrator | null;
  accessToken: string;
  onRequestMutation: (mutation: PendingMutation) => void;
}

export const CalendarsView: React.FC<CalendarsViewProps> = ({
  dataset,
  selectedExerciseId,
  onSelectExercise,
  currentAdmin,
  accessToken,
  onRequestMutation,
}) => {
  const adminId = currentAdmin?.admin_id || 'ADM-001';
  const currentExercise = dataset.ejercicios.find(
    (e) => e.exercise_id === selectedExerciseId
  );

  // New Exercise Form
  const [showNewExercise, setShowNewExercise] = useState(false);
  const [newYear, setNewYear] = useState<number>(2028);

  // New Holiday Form
  const [showNewHoliday, setShowNewHoliday] = useState(false);
  const [holDate, setHolDate] = useState('2027-01-01');
  const [holName, setHolName] = useState('');
  const [holScope, setHolScope] = useState<HolidayScope>('nacional');
  const [holTerritorio, setHolTerritorio] = useState('España');

  // New Local Holiday Form
  const [showNewLocalHol, setShowNewLocalHol] = useState(false);
  const [localProv, setLocalProv] = useState<ProvinceCLM>('Toledo');
  const [localMunicipio, setLocalMunicipio] = useState('');
  const [localDate, setLocalDate] = useState('2027-08-15');
  const [localName, setLocalName] = useState('');

  // Closure confirmation modal
  const [editingClosure, setEditingClosure] = useState<ClosureRecord | null>(null);
  const [closureEffectiveDate, setClosureEffectiveDate] = useState('');
  const [closureReason, setClosureReason] = useState<ClosureReason>('laborable');
  const [closureSource, setClosureSource] = useState('Circular confederal');
  const [closureRef, setClosureRef] = useState('');
  const [closureCommDate, setClosureCommDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const localHolidayConflictsForClosure = useMemo(() => {
    if (!closureEffectiveDate) return [];
    const conflictingLocal = dataset.festivosLocales.filter(
      (fl) =>
        fl.exercise_id === selectedExerciseId &&
        fl.activo &&
        fl.fecha === closureEffectiveDate
    );
    if (conflictingLocal.length === 0) return [];
    return dataset.personal.filter(
      (w) =>
        w.estado === 'activo' &&
        conflictingLocal.some(
          (fl) =>
            fl.municipio.toLowerCase() === w.municipio.toLowerCase() &&
            fl.provincia === w.provincia
        )
    );
  }, [closureEffectiveDate, dataset.festivosLocales, dataset.personal, selectedExerciseId]);

  const handleToggleExerciseValidation = () => {
    if (!currentExercise || !currentExercise._rowIndex) return;
    const nextVal = !currentExercise.validado_calendario;
    onRequestMutation({
      title: `${nextVal ? 'Validar' : 'Marcar como pendiente'} calendario oficial ${currentExercise.anio}`,
      description: `Se actualizará el campo validado_calendario del ejercicio ${currentExercise.anio} tras contrastarlo con el decreto oficial publicado en el DOCM.`,
      affectedTarget: `EJERCICIOS (fila ${currentExercise._rowIndex})`,
      execute: async () => {
        await updateTabRow(
          accessToken,
          dataset.spreadsheetId,
          'EJERCICIOS',
          currentExercise._rowIndex!,
          [
            currentExercise.exercise_id,
            currentExercise.anio,
            currentExercise.fecha_inicio,
            currentExercise.fecha_fin,
            currentExercise.estado,
            currentExercise.vacaciones_referencia,
            currentExercise.libre_disposicion_referencia,
            currentExercise.notas,
            nextVal ? 'TRUE' : 'FALSE',
          ]
        );
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'PLANTILLA',
          provinceSnapshot: 'CLM',
          recordType: 'EJERCICIOS',
          recordId: currentExercise.exercise_id,
          action: 'modificacion',
          oldValues: { validado_calendario: currentExercise.validado_calendario },
          newValues: { validado_calendario: nextVal },
          notes: `Validación oficial calendario ${currentExercise.anio}: ${nextVal}`,
        });
      },
    });
  };

  const handleCreateExercise = (e: React.FormEvent) => {
    e.preventDefault();
    const exId = `EX-${newYear}`;
    if (dataset.ejercicios.some((ex) => ex.exercise_id === exId)) return;

    const nowIso = new Date().toISOString();
    const activeWorkers = dataset.personal.filter((w) => w.estado === 'activo');

    const dec24Dow = getDayOfWeekUTC(`${newYear}-12-24`);
    const dec31Dow = getDayOfWeekUTC(`${newYear}-12-31`);
    const reasonFromDow = (dow: number): ClosureReason =>
      dow === 6 ? 'sabado' : dow === 0 ? 'domingo' : 'laborable';

    onRequestMutation({
      title: `Crear nuevo ejercicio ${newYear}`,
      description: `Se creará el ejercicio ${newYear}, los saldos iniciales (25 vacaciones / 3 LD) para ${activeWorkers.length} trabajadores activos y los dos cierres pendientes (24 y 31 de diciembre).`,
      affectedTarget: 'EJERCICIOS + SALDOS + CIERRES',
      affectedCountLabel: `1 ejercicio + ${activeWorkers.length * 2} saldos + 2 cierres`,
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'EJERCICIOS', [
          [
            exId,
            newYear,
            `${newYear}-01-01`,
            `${newYear}-12-31`,
            'activo',
            25,
            3,
            `Ejercicio ${newYear} creado desde administración. Pendiente carga y validación de festivos.`,
            'FALSE',
          ],
        ]);

        const balRows: (string | number)[][] = [];
        activeWorkers.forEach((w, idx) => {
          const n = String(idx + 1).padStart(3, '0');
          balRows.push([
            `BAL-${newYear}-V-${n}`,
            w.worker_id,
            exId,
            'vacaciones',
            25,
            0,
            'Asignación anual de referencia',
            nowIso,
            adminId,
            '',
          ]);
          balRows.push([
            `BAL-${newYear}-L-${n}`,
            w.worker_id,
            exId,
            'libre_disposicion',
            3,
            0,
            'Asignación anual independiente',
            nowIso,
            adminId,
            '',
          ]);
        });
        if (balRows.length > 0) {
          await appendTabRows(accessToken, dataset.spreadsheetId, 'SALDOS', balRows);
        }

        await appendTabRows(accessToken, dataset.spreadsheetId, 'CIERRES', [
          [
            `CIE-${newYear}-1224`,
            exId,
            `${newYear}-12-24`,
            `${newYear}-12-24`,
            reasonFromDow(dec24Dow),
            'pendiente',
            'Pendiente confirmación confederal',
            '',
            '',
            adminId,
            nowIso,
            nowIso,
          ],
          [
            `CIE-${newYear}-1231`,
            exId,
            `${newYear}-12-31`,
            `${newYear}-12-31`,
            reasonFromDow(dec31Dow),
            'pendiente',
            'Pendiente confirmación confederal',
            '',
            '',
            adminId,
            nowIso,
            nowIso,
          ],
        ]);

        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'PLANTILLA',
          provinceSnapshot: 'CLM',
          recordType: 'EJERCICIOS',
          recordId: exId,
          action: 'alta',
          oldValues: null,
          newValues: { exercise_id: exId, anio: newYear, workersSeeded: activeWorkers.length },
          notes: `Creación ejercicio ${newYear} con saldos y cierres iniciales`,
        });

        onSelectExercise(exId);
      },
    });
    setShowNewExercise(false);
  };

  const handleConfirmClosure = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClosure || !editingClosure._rowIndex || !closureEffectiveDate) return;
    const nowIso = new Date().toISOString();
    const activeWorkers = dataset.personal.filter((w) => w.estado === 'activo');

    // Find any existing active closure VACACIONES entries tied to this closure original date
    const existingClosureVacs = dataset.vacaciones.filter(
      (v) =>
        v.tipo === 'cierre' &&
        v.estado !== 'anulado' &&
        v.observaciones.includes(editingClosure.closure_id)
    );

    onRequestMutation({
      title: `Confirmar cierre confederal (${formatDateES(editingClosure.fecha_original)})`,
      description: `Se confirmará la fecha efectiva ${formatDateES(closureEffectiveDate)} (fuente: ${closureSource}) y se registrará 1 día tipo «cierre» en VACACIONES a ${activeWorkers.length} trabajadores activos.${
        existingClosureVacs.length > 0
          ? ` Además, se anularán ${existingClosureVacs.length} registros previos de este cierre.`
          : ''
      }`,
      affectedTarget: 'CIERRES + VACACIONES',
      affectedCountLabel: `1 cierre + ${activeWorkers.length} registros de cierre + HISTORICO`,
      variant: localHolidayConflictsForClosure.length > 0 ? 'warning' : 'standard',
      execute: async () => {
        await updateTabRow(
          accessToken,
          dataset.spreadsheetId,
          'CIERRES',
          editingClosure._rowIndex!,
          [
            editingClosure.closure_id,
            editingClosure.exercise_id,
            editingClosure.fecha_original,
            closureEffectiveDate,
            closureReason,
            'confirmado',
            closureSource.trim(),
            closureRef.trim(),
            closureCommDate,
            adminId,
            editingClosure.created_at,
            nowIso,
          ]
        );

        // Cancel previous closure records if modifying date
        for (const prevVac of existingClosureVacs) {
          if (prevVac._rowIndex) {
            await updateTabRow(
              accessToken,
              dataset.spreadsheetId,
              'VACACIONES',
              prevVac._rowIndex,
              [
                prevVac.vacation_id,
                prevVac.worker_id,
                prevVac.exercise_id,
                prevVac.tipo,
                prevVac.fecha_inicio,
                prevVac.fecha_fin,
                prevVac.dias_habiles_calculados,
                'anulado',
                `${prevVac.observaciones} | Anulado por cambio confederal de fecha`,
                prevVac.created_at,
                nowIso,
                prevVac.created_by,
                adminId,
              ]
            );
          }
        }

        // Create closure entries for all active workers
        const yearStr = editingClosure.exercise_id.replace('EX-', '');
        const baseIdx = dataset.vacaciones.length + 1;
        const newRows = activeWorkers.map((w, idx) => [
          `CIE-${yearStr}-${String(baseIdx + idx).padStart(3, '0')}`,
          w.worker_id,
          editingClosure.exercise_id, // imputed to original closure exercise (ap. 3.4)
          'cierre',
          closureEffectiveDate,
          closureEffectiveDate,
          1,
          'confirmado',
          `Cierre ${formatDateES(editingClosure.fecha_original)} (${editingClosure.closure_id}) · ${closureSource}`,
          nowIso,
          nowIso,
          adminId,
          adminId,
        ]);
        if (newRows.length > 0) {
          await appendTabRows(accessToken, dataset.spreadsheetId, 'VACACIONES', newRows);
        }

        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'PLANTILLA',
          provinceSnapshot: 'CLM',
          recordType: 'CIERRES',
          recordId: editingClosure.closure_id,
          action: editingClosure.estado === 'confirmado' ? 'modificacion' : 'alta',
          oldValues: editingClosure as unknown as Record<string, unknown>,
          newValues: {
            ...editingClosure,
            fecha_efectiva: closureEffectiveDate,
            estado: 'confirmado',
            fuente: closureSource,
            referencia: closureRef,
            workersApplied: activeWorkers.length,
          },
          notes: `Confirmación cierre ${formatDateES(editingClosure.fecha_original)} -> efectiva ${formatDateES(closureEffectiveDate)} (${closureSource})`,
        });
      },
    });
    setEditingClosure(null);
  };

  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!holName.trim()) return;
    const yearStr = selectedExerciseId.replace('EX-', '');
    const id = `FEST-${yearStr}-${String(dataset.festivos.length + 1).padStart(2, '0')}`;
    onRequestMutation({
      title: `Añadir festivo general: ${holName}`,
      description: `Se añadirá el festivo ${holName} (${formatDateES(holDate)}) al ejercicio ${yearStr}.`,
      affectedTarget: 'FESTIVOS',
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'FESTIVOS', [
          [
            id,
            selectedExerciseId,
            holDate,
            holName.trim(),
            holScope,
            holTerritorio.trim(),
            'TRUE',
            'Alta manual administración',
          ],
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'PLANTILLA',
          provinceSnapshot: 'CLM',
          recordType: 'FESTIVOS',
          recordId: id,
          action: 'alta',
          oldValues: null,
          newValues: { holiday_id: id, fecha: holDate, nombre: holName.trim() },
          notes: `Alta festivo ${holScope}: ${holName.trim()} (${formatDateES(holDate)})`,
        });
      },
    });
    setShowNewHoliday(false);
    setHolName('');
  };

  const handleAddLocalHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localMunicipio.trim() || !localName.trim()) return;
    const yearStr = selectedExerciseId.replace('EX-', '');
    const id = `FLOC-${yearStr}-${String(dataset.festivosLocales.length + 1).padStart(3, '0')}`;
    onRequestMutation({
      title: `Añadir festivo local: ${localName} (${localMunicipio})`,
      description: `Se añadirá el festivo local de ${localMunicipio} (${localProv}) para el ${formatDateES(localDate)}.`,
      affectedTarget: 'FESTIVOS_LOCALES',
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'FESTIVOS_LOCALES', [
          [
            id,
            selectedExerciseId,
            localMunicipio.trim(),
            localProv,
            localDate,
            localName.trim(),
            'TRUE',
            'Boletín oficial / resolución municipal',
          ],
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'PLANTILLA',
          provinceSnapshot: localProv,
          recordType: 'FESTIVOS_LOCALES',
          recordId: id,
          action: 'alta',
          oldValues: null,
          newValues: {
            local_holiday_id: id,
            municipio: localMunicipio.trim(),
            provincia: localProv,
            fecha: localDate,
            nombre: localName.trim(),
          },
          notes: `Alta festivo local ${localMunicipio.trim()} (${localProv}): ${localName.trim()}`,
        });
      },
    });
    setShowNewLocalHol(false);
    setLocalName('');
  };

  const exerciseHolidays = dataset.festivos.filter(
    (f) => f.exercise_id === selectedExerciseId
  );
  const exerciseLocalHolidays = dataset.festivosLocales.filter(
    (fl) => fl.exercise_id === selectedExerciseId
  );
  const exerciseClosures = dataset.cierres.filter(
    (c) => c.exercise_id === selectedExerciseId
  );

  return (
    <div className="space-y-6">
      {/* Exercise Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-slate-500">Ejercicio activo</p>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={selectedExerciseId}
                onChange={(e) => onSelectExercise(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-sm font-semibold text-slate-900"
              >
                {dataset.ejercicios.map((ex) => (
                  <option key={ex.exercise_id} value={ex.exercise_id}>
                    {ex.anio} ({ex.estado})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleToggleExerciseValidation}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  currentExercise?.validado_calendario
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {currentExercise?.validado_calendario
                    ? 'Calendario DOCM validado'
                    : 'Marcar calendario DOCM como validado'}
                </span>
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNewExercise(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Crear ejercicio sucesivo</span>
        </button>
      </div>

      {/* Section 3.1: Closures Dec 24 & Dec 31 */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Cierres confederales de 24 y 31 de diciembre (ap. 3.1)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Forman parte de los 25 días de vacaciones. Si coinciden con fin de semana o festivo, la
            confederación fija la fecha sustitutiva. Mientras estén pendientes, los saldos e informes
            son provisionales.
          </p>
        </div>

        <div className="divide-y divide-slate-100">
          {exerciseClosures.map((c) => (
            <div
              key={c.closure_id}
              className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {formatDateES(c.fecha_original)}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="capitalize text-slate-600">{c.motivo}</span>
                  <span className="text-slate-400">·</span>
                  <span
                    className={`font-semibold capitalize ${
                      c.estado === 'confirmado' ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {c.estado}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  Fecha efectiva:{' '}
                  <span className="font-mono font-medium text-slate-900">
                    {formatDateES(c.fecha_efectiva)}
                  </span>{' '}
                  · Fuente: {c.fuente || 'Pendiente'}
                  {c.referencia && ` (${c.referencia})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingClosure(c);
                  setClosureEffectiveDate(c.fecha_efectiva);
                  setClosureReason(c.motivo);
                  setClosureSource(
                    c.fuente === 'Pendiente confirmación confederal'
                      ? 'Circular confederal'
                      : c.fuente
                  );
                  setClosureRef(c.referencia);
                  setClosureCommDate(
                    c.fecha_comunicacion || new Date().toISOString().slice(0, 10)
                  );
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <CalendarCheck2 className="h-3.5 w-3.5" />
                <span>
                  {c.estado === 'confirmado'
                    ? 'Modificar fecha confederal'
                    : 'Confirmar y aplicar a plantilla'}
                </span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Two columns: National/CLM Holidays & Local Holidays */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Festivos nacionales y autonómicos ({exerciseHolidays.length})
              </h3>
              <p className="text-xs text-slate-500">
                Contrastable con Decreto 34/2026 (DOCM 13/07/2026)
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setHolDate(`${selectedExerciseId.replace('EX-', '')}-01-01`);
                setShowNewHoliday(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Añadir</span>
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
            {exerciseHolidays.map((f) => (
              <div key={f.holiday_id} className="flex items-center justify-between px-6 py-2.5">
                <div>
                  <p className="font-medium text-slate-900">{f.nombre}</p>
                  <p className="text-slate-500 capitalize">
                    {f.ambito} · {f.territorio}
                  </p>
                </div>
                <span className="font-mono font-medium text-slate-800 tabular-nums">
                  {formatDateES(f.fecha)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Festivos locales por municipio ({exerciseLocalHolidays.length})
              </h3>
              <p className="text-xs text-slate-500">
                Dos festivos locales por municipio de centro de trabajo
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalDate(`${selectedExerciseId.replace('EX-', '')}-08-15`);
                setShowNewLocalHol(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Añadir</span>
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
            {exerciseLocalHolidays.map((fl) => (
              <div
                key={fl.local_holiday_id}
                className="flex items-center justify-between px-6 py-2.5"
              >
                <div>
                  <p className="font-medium text-slate-900">{fl.nombre}</p>
                  <p className="text-slate-500">
                    {fl.municipio} ({fl.provincia})
                  </p>
                </div>
                <span className="font-mono font-medium text-slate-800 tabular-nums">
                  {formatDateES(fl.fecha)}
                </span>
              </div>
            ))}
            {exerciseLocalHolidays.length === 0 && (
              <div className="px-6 py-10 text-center text-slate-500">
                Aún no se han cargado los festivos locales municipales.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Confirm Closure Modal */}
      {editingClosure && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleConfirmClosure}
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Confirmar cierre de {formatDateES(editingClosure.fecha_original)}
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fecha efectiva confederal *
                  </label>
                  <input
                    type="date"
                    required
                    value={closureEffectiveDate}
                    onChange={(e) => setClosureEffectiveDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Motivo fecha orig.</label>
                  <select
                    value={closureReason}
                    onChange={(e) => setClosureReason(e.target.value as ClosureReason)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  >
                    <option value="laborable">Laborable</option>
                    <option value="sabado">Sábado</option>
                    <option value="domingo">Domingo</option>
                    <option value="festivo">Festivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fuente (circular / acuerdo) *
                  </label>
                  <input
                    type="text"
                    required
                    value={closureSource}
                    onChange={(e) => setClosureSource(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Fecha comunicación *
                  </label>
                  <input
                    type="date"
                    required
                    value={closureCommDate}
                    onChange={(e) => setClosureCommDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Referencia</label>
                <input
                  type="text"
                  value={closureRef}
                  onChange={(e) => setClosureRef(e.target.value)}
                  placeholder="Ej. Circular Confederal 14/2027"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>

              {localHolidayConflictsForClosure.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Coincidencia con festivo local</span>
                  </div>
                  <p className="mt-1">
                    La fecha seleccionada coincide con un festivo local de:{' '}
                    {localHolidayConflictsForClosure.map((w) => w.nombre).join(', ')}. Puedes
                    continuar igualmente según el apartado 3.1.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setEditingClosure(null)}
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

      {/* New Exercise Modal */}
      {showNewExercise && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateExercise}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Crear ejercicio sucesivo
              </h3>
            </div>
            <div className="px-6 py-5 text-xs space-y-3">
              <label className="block font-medium text-slate-700">Año del ejercicio</label>
              <input
                type="number"
                min={2027}
                max={2040}
                required
                value={newYear}
                onChange={(e) => setNewYear(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewExercise(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800"
              >
                Crear ejercicio
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add General Holiday Modal */}
      {showNewHoliday && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleAddHoliday}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">Añadir festivo general</h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  required
                  value={holDate}
                  onChange={(e) => setHolDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  required
                  value={holName}
                  onChange={(e) => setHolName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ámbito</label>
                  <select
                    value={holScope}
                    onChange={(e) => setHolScope(e.target.value as HolidayScope)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    <option value="nacional">Nacional</option>
                    <option value="autonomico">Autonómico CLM</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Territorio</label>
                  <input
                    type="text"
                    value={holTerritorio}
                    onChange={(e) => setHolTerritorio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewHoliday(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Guardar festivo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Local Holiday Modal */}
      {showNewLocalHol && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleAddLocalHoliday}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">Añadir festivo local</h3>
            </div>
            <div className="space-y-3 px-6 py-5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Provincia *</label>
                  <select
                    value={localProv}
                    onChange={(e) => setLocalProv(e.target.value as ProvinceCLM)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  >
                    {PROVINCES_CLM.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Municipio *</label>
                  <input
                    type="text"
                    required
                    value={localMunicipio}
                    onChange={(e) => setLocalMunicipio(e.target.value)}
                    placeholder="Municipio centro de trabajo"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  required
                  value={localDate}
                  onChange={(e) => setLocalDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Festividad *</label>
                <input
                  type="text"
                  required
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowNewLocalHol(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-semibold text-white"
              >
                Guardar festivo local
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
