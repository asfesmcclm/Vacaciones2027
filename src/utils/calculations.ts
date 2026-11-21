import {
  AbsenceRecord,
  AuditMovement,
  BalanceRecord,
  ClosureRecord,
  Exercise,
  HolidayRecord,
  LibreDisposicionRecord,
  LocalHolidayRecord,
  ProvinceCLM,
  SpreadsheetDataset,
  VacationRecord,
  Worker,
} from '../types/sheets';
import { sha256Hex } from '../services/sheetsApi';

export function eachDateISO(startISO: string, endISO: string): string[] {
  if (!startISO || !endISO || startISO > endISO) return [];
  const dates: string[] = [];
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  let safety = 0;
  while (cur <= end && safety < 800) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
    safety++;
  }
  return dates;
}

export function getDayOfWeekUTC(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun, 6=Sat
}

export function formatDateES(dateISO: string): string {
  if (!dateISO) return '—';
  const parts = dateISO.slice(0, 10).split('-');
  if (parts.length !== 3) return dateISO;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateTimeES(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface DayBreakdown {
  date: string;
  status: 'habil' | 'fin_de_semana' | 'festivo_nacional_autonomico' | 'festivo_local' | 'cierre';
  reason: string;
}

export interface WorkingDaysCalculation {
  businessDays: number;
  totalCalendarDays: number;
  excludedWeekends: number;
  excludedHolidays: number;
  excludedLocalHolidays: number;
  excludedClosures: number;
  crossesYears: boolean;
  yearsInvolved: number[];
  splitByYear: Record<number, number>;
  dayDetails: DayBreakdown[];
}

export function calculateWorkingDaysForWorker(params: {
  worker: Worker;
  startDate: string;
  endDate: string;
  festivos: HolidayRecord[];
  festivosLocales: LocalHolidayRecord[];
  cierres: ClosureRecord[];
}): WorkingDaysCalculation {
  const dates = eachDateISO(params.startDate, params.endDate);
  const splitByYear: Record<number, number> = {};
  const yearsSet = new Set<number>();
  const dayDetails: DayBreakdown[] = [];

  let businessDays = 0;
  let excludedWeekends = 0;
  let excludedHolidays = 0;
  let excludedLocalHolidays = 0;
  let excludedClosures = 0;

  for (const date of dates) {
    const year = Number(date.slice(0, 4));
    yearsSet.add(year);
    const dow = getDayOfWeekUTC(date);

    if (dow === 0 || dow === 6) {
      excludedWeekends++;
      dayDetails.push({
        date,
        status: 'fin_de_semana',
        reason: dow === 6 ? 'Sábado' : 'Domingo',
      });
      continue;
    }

    const generalHoliday = params.festivos.find(
      (f) => f.activo && f.fecha === date
    );
    if (generalHoliday) {
      excludedHolidays++;
      dayDetails.push({
        date,
        status: 'festivo_nacional_autonomico',
        reason: `${generalHoliday.nombre} (${generalHoliday.ambito})`,
      });
      continue;
    }

    const localHoliday = params.festivosLocales.find(
      (fl) =>
        fl.activo &&
        fl.fecha === date &&
        params.worker.municipio.trim() !== '' &&
        fl.municipio.trim().toLowerCase() === params.worker.municipio.trim().toLowerCase() &&
        fl.provincia === params.worker.provincia
    );
    if (localHoliday) {
      excludedLocalHolidays++;
      dayDetails.push({
        date,
        status: 'festivo_local',
        reason: `Festivo local: ${localHoliday.nombre} (${localHoliday.municipio})`,
      });
      continue;
    }

    const activeClosure = params.cierres.find(
      (c) => c.estado === 'confirmado' && c.fecha_efectiva === date
    );
    if (activeClosure) {
      excludedClosures++;
      dayDetails.push({
        date,
        status: 'cierre',
        reason: `Día de cierre confederal (${formatDateES(activeClosure.fecha_original)})`,
      });
      continue;
    }

    businessDays++;
    splitByYear[year] = (splitByYear[year] || 0) + 1;
    dayDetails.push({
      date,
      status: 'habil',
      reason: 'Día hábil descontable',
    });
  }

  return {
    businessDays,
    totalCalendarDays: dates.length,
    excludedWeekends,
    excludedHolidays,
    excludedLocalHolidays,
    excludedClosures,
    crossesYears: yearsSet.size > 1,
    yearsInvolved: Array.from(yearsSet).sort(),
    splitByYear,
    dayDetails,
  };
}

export interface OverlapWarning {
  type: 'vacaciones' | 'libre_disposicion' | 'ausencia' | 'art_38_3_et';
  recordId: string;
  startDate: string;
  endDate: string;
  message: string;
}

export function detectWorkerOverlaps(params: {
  workerId: string;
  startDate: string;
  endDate: string;
  excludeRecordId?: string;
  isAbsence?: boolean;
  vacaciones: VacationRecord[];
  libreDisposicion: LibreDisposicionRecord[];
  ausencias: AbsenceRecord[];
}): OverlapWarning[] {
  const warnings: OverlapWarning[] = [];
  const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    aStart <= bEnd && bStart <= aEnd;

  for (const v of params.vacaciones) {
    if (v.worker_id !== params.workerId || v.estado === 'anulado') continue;
    if (v.vacation_id === params.excludeRecordId) continue;
    if (overlaps(params.startDate, params.endDate, v.fecha_inicio, v.fecha_fin)) {
      if (params.isAbsence) {
        warnings.push({
          type: 'art_38_3_et',
          recordId: v.vacation_id,
          startDate: v.fecha_inicio,
          endDate: v.fecha_fin,
          message: `Coincidencia con vacaciones (${v.vacation_id}: ${formatDateES(v.fecha_inicio)} - ${formatDateES(v.fecha_fin)}). Aviso Art. 38.3 ET: si corresponde a incapacidad temporal, puede proceder disfrutar las vacaciones en otro momento (decisión de administración).`,
        });
      } else {
        warnings.push({
          type: 'vacaciones',
          recordId: v.vacation_id,
          startDate: v.fecha_inicio,
          endDate: v.fecha_fin,
          message: `Solape con periodo de vacaciones ${v.vacation_id} (${formatDateES(v.fecha_inicio)} - ${formatDateES(v.fecha_fin)}).`,
        });
      }
    }
  }

  for (const ld of params.libreDisposicion) {
    if (ld.worker_id !== params.workerId || ld.estado === 'anulado') continue;
    if (ld.leave_id === params.excludeRecordId) continue;
    if (overlaps(params.startDate, params.endDate, ld.fecha_inicio, ld.fecha_fin)) {
      warnings.push({
        type: 'libre_disposicion',
        recordId: ld.leave_id,
        startDate: ld.fecha_inicio,
        endDate: ld.fecha_fin,
        message: `Solape con Libre Disposición ${ld.leave_id} (${formatDateES(ld.fecha_inicio)} - ${formatDateES(ld.fecha_fin)}).`,
      });
    }
  }

  for (const ab of params.ausencias) {
    if (ab.worker_id !== params.workerId || ab.estado === 'anulado') continue;
    if (ab.absence_id === params.excludeRecordId) continue;
    if (overlaps(params.startDate, params.endDate, ab.fecha_inicio, ab.fecha_fin)) {
      warnings.push({
        type: 'ausencia',
        recordId: ab.absence_id,
        startDate: ab.fecha_inicio,
        endDate: ab.fecha_fin,
        message: `Solape con ausencia registrada ${ab.absence_id} (${formatDateES(ab.fecha_inicio)} - ${formatDateES(ab.fecha_fin)}).`,
      });
    }
  }

  return warnings;
}

export interface WorkerBalanceSummary {
  workerId: string;
  exerciseId: string;
  vacacionesAsignadas: number;
  vacacionesAjustes: number;
  vacacionesTotalAsignado: number;
  cierresDescontados: number;
  vacacionesLibresElegibles: number;
  vacacionesConsumidas: number;
  vacacionesPendientes: number;
  ldAsignados: number;
  ldAjustes: number;
  ldTotalAsignado: number;
  ldConsumidos: number;
  ldPendientes: number;
  esProvisional: boolean;
  cierresPendientesCount: number;
}

export function computeWorkerBalance(params: {
  workerId: string;
  exerciseId: string;
  saldos: BalanceRecord[];
  vacaciones: VacationRecord[];
  libreDisposicion: LibreDisposicionRecord[];
  ausencias: AbsenceRecord[];
  cierres: ClosureRecord[];
}): WorkerBalanceSummary {
  const vacBalances = params.saldos.filter(
    (s) =>
      s.worker_id === params.workerId &&
      s.exercise_id === params.exerciseId &&
      s.concepto === 'vacaciones'
  );
  const ldBalances = params.saldos.filter(
    (s) =>
      s.worker_id === params.workerId &&
      s.exercise_id === params.exerciseId &&
      s.concepto === 'libre_disposicion'
  );

  const vacBase = vacBalances.reduce((sum, b) => sum + b.dias_asignados, 0);
  const vacAdj = vacBalances.reduce((sum, b) => sum + b.ajustes, 0);
  const vacTotal = vacBase + vacAdj;

  const ldBase = ldBalances.reduce((sum, b) => sum + b.dias_asignados, 0);
  const ldAdj = ldBalances.reduce((sum, b) => sum + b.ajustes, 0);
  const ldTotal = ldBase + ldAdj;

  const cierresExercise = params.cierres.filter(
    (c) => c.exercise_id === params.exerciseId
  );
  const cierresPendientesCount = cierresExercise.filter(
    (c) => c.estado === 'pendiente'
  ).length;

  const workerVacRecords = params.vacaciones.filter(
    (v) =>
      v.worker_id === params.workerId &&
      v.exercise_id === params.exerciseId &&
      v.estado !== 'anulado'
  );

  const cierresDescontados = workerVacRecords
    .filter((v) => v.tipo === 'cierre')
    .reduce((sum, v) => sum + v.dias_habiles_calculados, 0);

  const vacFromVacaciones = workerVacRecords
    .filter((v) => v.tipo === 'vacaciones')
    .reduce((sum, v) => sum + v.dias_habiles_calculados, 0);

  const vacFromAbsences = params.ausencias
    .filter(
      (a) =>
        a.worker_id === params.workerId &&
        a.estado !== 'anulado' &&
        a.regla_descuento === 'descuenta_vacaciones' &&
        a.fecha_inicio.startsWith(params.exerciseId.replace('EX-', ''))
    )
    .reduce((sum, a) => sum + a.dias_naturales, 0);

  const ldConsumidos =
    params.libreDisposicion
      .filter(
        (l) =>
          l.worker_id === params.workerId &&
          l.exercise_id === params.exerciseId &&
          l.estado !== 'anulado'
      )
      .reduce((sum, l) => sum + l.dias_descontados, 0) +
    params.ausencias
      .filter(
        (a) =>
          a.worker_id === params.workerId &&
          a.estado !== 'anulado' &&
          a.regla_descuento === 'descuenta_ld' &&
          a.fecha_inicio.startsWith(params.exerciseId.replace('EX-', ''))
      )
      .reduce((sum, a) => sum + a.dias_naturales, 0);

  const vacacionesConsumidas = vacFromVacaciones + vacFromAbsences;
  const vacacionesLibresElegibles = Math.max(0, vacTotal - cierresDescontados);
  const vacacionesPendientes = vacTotal - cierresDescontados - vacacionesConsumidas;
  const ldPendientes = ldTotal - ldConsumidos;

  return {
    workerId: params.workerId,
    exerciseId: params.exerciseId,
    vacacionesAsignadas: vacBase,
    vacacionesAjustes: vacAdj,
    vacacionesTotalAsignado: vacTotal,
    cierresDescontados,
    vacacionesLibresElegibles,
    vacacionesConsumidas,
    vacacionesPendientes,
    ldAsignados: ldBase,
    ldAjustes: ldAdj,
    ldTotalAsignado: ldTotal,
    ldConsumidos,
    ldPendientes,
    esProvisional: cierresPendientesCount > 0,
    cierresPendientesCount,
  };
}

export interface ProvincialCoincidenceAlert {
  provincia: ProvinceCLM;
  date: string;
  workers: Array<{ workerId: string; nombre: string; tipo: string }>;
}

export function detectProvincialCoincidences(params: {
  personal: Worker[];
  vacaciones: VacationRecord[];
  libreDisposicion: LibreDisposicionRecord[];
  ausencias: AbsenceRecord[];
  startDate: string;
  endDate: string;
}): ProvincialCoincidenceAlert[] {
  const dates = eachDateISO(params.startDate, params.endDate);
  const activeWorkers = params.personal.filter((w) => w.estado === 'activo');
  const alerts: ProvincialCoincidenceAlert[] = [];

  for (const date of dates) {
    const byProvince: Record<string, Array<{ workerId: string; nombre: string; tipo: string }>> = {};

    for (const w of activeWorkers) {
      const vac = params.vacaciones.find(
        (v) =>
          v.worker_id === w.worker_id &&
          v.estado !== 'anulado' &&
          v.fecha_inicio <= date &&
          v.fecha_fin >= date
      );
      const ld = params.libreDisposicion.find(
        (l) =>
          l.worker_id === w.worker_id &&
          l.estado !== 'anulado' &&
          l.fecha_inicio <= date &&
          l.fecha_fin >= date
      );
      const ab = params.ausencias.find(
        (a) =>
          a.worker_id === w.worker_id &&
          a.estado !== 'anulado' &&
          a.afecta_disponibilidad &&
          a.fecha_inicio <= date &&
          a.fecha_fin >= date
      );

      if (vac || ld || ab) {
        if (!byProvince[w.provincia]) byProvince[w.provincia] = [];
        byProvince[w.provincia].push({
          workerId: w.worker_id,
          nombre: `${w.nombre} ${w.apellidos}`.trim(),
          tipo: vac ? (vac.tipo === 'cierre' ? 'Cierre' : 'Vacaciones') : ld ? 'Libre Disposición' : 'Ausencia',
        });
      }
    }

    Object.entries(byProvince).forEach(([prov, list]) => {
      if (list.length >= 2) {
        alerts.push({
          provincia: prov as ProvinceCLM,
          date,
          workers: list,
        });
      }
    });
  }

  return alerts;
}

/**
 * Reconstructs system state as of a specific cutoff date/time (`fecha de corte`)
 * using the append-only HISTORICO log (Section 9.2).
 */
export function reconstructStateAtCutoff(
  dataset: SpreadsheetDataset,
  cutoffIso: string
): {
  vacaciones: VacationRecord[];
  libreDisposicion: LibreDisposicionRecord[];
  ausencias: AbsenceRecord[];
  saldos: BalanceRecord[];
  movementsApplied: number;
  usedHistoricalLog: boolean;
} {
  // Check if there are movement snapshots for VACACIONES/LIBRE_DISPOSICION/AUSENCIAS/SALDOS
  const relevantMovements = dataset.historico
    .filter((m) => m.timestamp <= cutoffIso)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const vacMap = new Map<string, VacationRecord>();
  const ldMap = new Map<string, LibreDisposicionRecord>();
  const abMap = new Map<string, AbsenceRecord>();
  const saldosMap = new Map<string, BalanceRecord>();

  // Seed baseline balances & initial records created before cutoff if they weren't logged via HISTORICO
  dataset.saldos.forEach((s) => {
    if (!s.fecha_asignacion || s.fecha_asignacion <= cutoffIso) {
      saldosMap.set(s.balance_id, { ...s });
    }
  });

  let movementsApplied = 0;

  for (const mov of relevantMovements) {
    if (!mov.new_values) continue;
    try {
      const parsed = JSON.parse(mov.new_values);
      if (mov.record_type === 'VACACIONES' && mov.record_id) {
        vacMap.set(mov.record_id, parsed as VacationRecord);
        movementsApplied++;
      } else if (mov.record_type === 'LIBRE_DISPOSICION' && mov.record_id) {
        ldMap.set(mov.record_id, parsed as LibreDisposicionRecord);
        movementsApplied++;
      } else if (mov.record_type === 'AUSENCIAS' && mov.record_id) {
        abMap.set(mov.record_id, parsed as AbsenceRecord);
        movementsApplied++;
      } else if (mov.record_type === 'SALDOS' && mov.record_id) {
        saldosMap.set(mov.record_id, parsed as BalanceRecord);
        movementsApplied++;
      }
    } catch {
      // Ignore non-JSON system movements
    }
  }

  // Fallback for records whose created_at <= cutoffIso even if manually entered in Sheet without HISTORICO row
  dataset.vacaciones.forEach((v) => {
    if (!vacMap.has(v.vacation_id) && (!v.created_at || v.created_at <= cutoffIso)) {
      vacMap.set(v.vacation_id, { ...v });
    }
  });
  dataset.libreDisposicion.forEach((l) => {
    if (!ldMap.has(l.leave_id) && (!l.created_at || l.created_at <= cutoffIso)) {
      ldMap.set(l.leave_id, { ...l });
    }
  });
  dataset.ausencias.forEach((a) => {
    if (!abMap.has(a.absence_id) && (!a.created_at || a.created_at <= cutoffIso)) {
      abMap.set(a.absence_id, { ...a });
    }
  });

  return {
    vacaciones: Array.from(vacMap.values()),
    libreDisposicion: Array.from(ldMap.values()),
    ausencias: Array.from(abMap.values()),
    saldos: Array.from(saldosMap.values()),
    movementsApplied,
    usedHistoricalLog: relevantMovements.length > 0,
  };
}

export async function verifyHistoryChainIntegrity(
  history: AuditMovement[]
): Promise<{
  valid: boolean;
  checkedCount: number;
  brokenAtMovementId?: string;
}> {
  if (history.length <= 1) {
    return { valid: true, checkedCount: history.length };
  }

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const payload = `${prev.hash_prev}|${curr.movement_id}|${curr.timestamp}|${curr.admin_id}|${curr.worker_id}|${curr.record_type}|${curr.record_id}|${curr.action}|${curr.old_values}|${curr.new_values}`;
    const expected = await sha256Hex(payload);
    if (expected !== curr.hash_prev) {
      return {
        valid: false,
        checkedCount: i + 1,
        brokenAtMovementId: curr.movement_id,
      };
    }
  }

  return { valid: true, checkedCount: history.length };
}

export function isExerciseProvisional(exercise: Exercise | undefined, cierres: ClosureRecord[]): boolean {
  if (!exercise) return true;
  if (!exercise.validado_calendario) return true;
  return cierres.some(
    (c) => c.exercise_id === exercise.exercise_id && c.estado === 'pendiente'
  );
}
