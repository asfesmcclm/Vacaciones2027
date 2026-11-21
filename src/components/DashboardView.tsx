import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Users,
} from 'lucide-react';
import {
  Administrator,
  PROVINCES_CLM,
  ProvinceCLM,
  SpreadsheetDataset,
} from '../types/sheets';
import {
  detectProvincialCoincidences,
  eachDateISO,
  formatDateES,
  formatDateTimeES,
  isExerciseProvisional,
  todayISO,
} from '../utils/calculations';

interface DashboardViewProps {
  dataset: SpreadsheetDataset;
  selectedExerciseId: string;
  currentAdmin: Administrator | null;
  onSelectWorker: (workerId: string) => void;
  onNavigateTab: (tab: string) => void;
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  selectedExerciseId,
  onSelectWorker,
  onNavigateTab,
}) => {
  const exercise = dataset.ejercicios.find(
    (e) => e.exercise_id === selectedExerciseId
  ) || dataset.ejercicios[0];
  const exerciseYear = exercise ? exercise.anio : 2027;

  const [provinceFilter, setProvinceFilter] = useState<ProvinceCLM | 'TODAS'>('TODAS');
  const [workerFilter, setWorkerFilter] = useState<string>('TODOS');
  const [typeFilter, setTypeFilter] = useState<'TODOS' | 'vacaciones' | 'libre_disposicion' | 'ausencia'>('TODOS');
  const [calendarMode, setCalendarMode] = useState<'mensual' | 'anual'>('mensual');
  const [calendarMonth, setCalendarMonth] = useState<number>(0); // 0..11

  const today = todayISO();
  const activeWorkers = useMemo(
    () => dataset.personal.filter((w) => w.estado === 'activo'),
    [dataset.personal]
  );

  const filteredWorkers = useMemo(() => {
    return activeWorkers.filter((w) => {
      if (provinceFilter !== 'TODAS' && w.provincia !== provinceFilter) return false;
      if (workerFilter !== 'TODOS' && w.worker_id !== workerFilter) return false;
      return true;
    });
  }, [activeWorkers, provinceFilter, workerFilter]);

  const provisional = isExerciseProvisional(exercise, dataset.cierres);

  // Today status calculation (neutral RGPD-safe display)
  const todayStats = useMemo(() => {
    let onVacation = 0;
    let onLD = 0;
    let onAbsence = 0;

    activeWorkers.forEach((w) => {
      const hasVac = dataset.vacaciones.some(
        (v) =>
          v.worker_id === w.worker_id &&
          v.estado !== 'anulado' &&
          v.fecha_inicio <= today &&
          v.fecha_fin >= today
      );
      const hasLd = dataset.libreDisposicion.some(
        (l) =>
          l.worker_id === w.worker_id &&
          l.estado !== 'anulado' &&
          l.fecha_inicio <= today &&
          l.fecha_fin >= today
      );
      const hasAb = dataset.ausencias.some(
        (a) =>
          a.worker_id === w.worker_id &&
          a.estado !== 'anulado' &&
          a.afecta_disponibilidad &&
          a.fecha_inicio <= today &&
          a.fecha_fin >= today
      );

      if (hasVac) onVacation++;
      else if (hasLd) onLD++;
      else if (hasAb) onAbsence++;
    });

    const available = Math.max(0, activeWorkers.length - onVacation - onLD - onAbsence);
    return {
      totalActive: activeWorkers.length,
      onVacation,
      onLD,
      onAbsence,
      available,
    };
  }, [activeWorkers, dataset.vacaciones, dataset.libreDisposicion, dataset.ausencias, today]);

  // Provincial coincidences across the selected exercise year
  const provincialAlerts = useMemo(() => {
    const start = `${exerciseYear}-01-01`;
    const end = `${exerciseYear}-12-31`;
    return detectProvincialCoincidences({
      personal: dataset.personal,
      vacaciones: dataset.vacaciones,
      libreDisposicion: dataset.libreDisposicion,
      ausencias: dataset.ausencias,
      startDate: start,
      endDate: end,
    });
  }, [dataset, exerciseYear]);

  // Upcoming vacations & absences (sorted chronologically)
  const upcomingItems = useMemo(() => {
    const workerMap = new Map(dataset.personal.map((w) => [w.worker_id, w]));
    const items: Array<{
      id: string;
      workerId: string;
      workerName: string;
      provincia: string;
      tipo: string;
      inicio: string;
      fin: string;
      dias: string;
    }> = [];

    dataset.vacaciones
      .filter((v) => v.estado !== 'anulado' && v.fecha_fin >= today)
      .forEach((v) => {
        const w = workerMap.get(v.worker_id);
        if (!w) return;
        items.push({
          id: v.vacation_id,
          workerId: v.worker_id,
          workerName: `${w.nombre} ${w.apellidos}`.trim(),
          provincia: w.provincia,
          tipo: v.tipo === 'cierre' ? 'Cierre confederal' : 'Vacaciones',
          inicio: v.fecha_inicio,
          fin: v.fecha_fin,
          dias: `${v.dias_habiles_calculados} háb.`,
        });
      });

    dataset.libreDisposicion
      .filter((l) => l.estado !== 'anulado' && l.fecha_fin >= today)
      .forEach((l) => {
        const w = workerMap.get(l.worker_id);
        if (!w) return;
        items.push({
          id: l.leave_id,
          workerId: l.worker_id,
          workerName: `${w.nombre} ${w.apellidos}`.trim(),
          provincia: w.provincia,
          tipo: 'Libre disposición',
          inicio: l.fecha_inicio,
          fin: l.fecha_fin,
          dias: `${l.dias_descontados} d.`,
        });
      });

    // RGPD: Show only neutral category "Ausencia" on general dashboard
    dataset.ausencias
      .filter((a) => a.estado !== 'anulado' && a.afecta_disponibilidad && a.fecha_fin >= today)
      .forEach((a) => {
        const w = workerMap.get(a.worker_id);
        if (!w) return;
        items.push({
          id: a.absence_id,
          workerId: a.worker_id,
          workerName: `${w.nombre} ${w.apellidos}`.trim(),
          provincia: w.provincia,
          tipo: 'Ausencia',
          inicio: a.fecha_inicio,
          fin: a.fecha_fin,
          dias: `${a.dias_naturales} nat.`,
        });
      });

    return items
      .filter((it) => {
        if (provinceFilter !== 'TODAS' && it.provincia !== provinceFilter) return false;
        if (workerFilter !== 'TODOS' && it.workerId !== workerFilter) return false;
        return true;
      })
      .sort((a, b) => a.inicio.localeCompare(b.inicio))
      .slice(0, 8);
  }, [dataset, today, provinceFilter, workerFilter]);

  const monthDays = useMemo(() => {
    const start = `${exerciseYear}-${String(calendarMonth + 1).padStart(2, '0')}-01`;
    const lastDayNum = new Date(Date.UTC(exerciseYear, calendarMonth + 1, 0)).getUTCDate();
    const end = `${exerciseYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
    return eachDateISO(start, end);
  }, [exerciseYear, calendarMonth]);

  const getWorkerDayMark = (workerId: string, date: string) => {
    if (typeFilter === 'TODOS' || typeFilter === 'vacaciones') {
      const vac = dataset.vacaciones.find(
        (v) =>
          v.worker_id === workerId &&
          v.estado !== 'anulado' &&
          v.fecha_inicio <= date &&
          v.fecha_fin >= date
      );
      if (vac) {
        return vac.tipo === 'cierre'
          ? { code: 'C', title: 'Cierre confederal', cls: 'bg-slate-800 text-white' }
          : { code: 'V', title: 'Vacaciones', cls: 'bg-red-700 text-white' };
      }
    }
    if (typeFilter === 'TODOS' || typeFilter === 'libre_disposicion') {
      const ld = dataset.libreDisposicion.find(
        (l) =>
          l.worker_id === workerId &&
          l.estado !== 'anulado' &&
          l.fecha_inicio <= date &&
          l.fecha_fin >= date
      );
      if (ld) {
        return { code: 'L', title: 'Libre disposición', cls: 'bg-amber-600 text-white' };
      }
    }
    if (typeFilter === 'TODOS' || typeFilter === 'ausencia') {
      const ab = dataset.ausencias.find(
        (a) =>
          a.worker_id === workerId &&
          a.estado !== 'anulado' &&
          a.afecta_disponibilidad &&
          a.fecha_inicio <= date &&
          a.fecha_fin >= date
      );
      if (ab) {
        // Strictly neutral on general dashboard (RGPD art. 9)
        return { code: 'A', title: 'Ausencia', cls: 'bg-slate-500 text-white' };
      }
    }
    const holiday = dataset.festivos.find((f) => f.activo && f.fecha === date);
    if (holiday) {
      return { code: 'F', title: holiday.nombre, cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    }
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) {
      return { code: '', title: 'Fin de semana', cls: 'bg-slate-100 text-slate-400' };
    }
    return null;
  };

  const recentAudit = useMemo(() => {
    return [...dataset.historico].reverse().slice(0, 6);
  }, [dataset.historico]);

  return (
    <div className="space-y-6">
      {provisional && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5 text-sm text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">
                Ejercicio {exerciseYear} en estado provisional
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Existen cierres del 24/31 de diciembre pendientes de confirmación confederal o el
                calendario laboral oficial aún está pendiente de validación.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('calendarios')}
            className="rounded-lg border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
          >
            Revisar calendario y cierres
          </button>
        </div>
      )}

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Trabajadores activos</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-slate-900 tabular-nums">
            {todayStats.totalActive}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            5 provincias · {dataset.personal.length} totales en registro
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Disponibles hoy ({formatDateES(today)})</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-emerald-700 tabular-nums">
            {todayStats.available}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Cobertura operativa en plantilla
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">De vacaciones / LD hoy</p>
          <p className="mt-2 font-mono text-3xl font-semibold text-red-700 tabular-nums">
            {todayStats.onVacation + todayStats.onLD}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {todayStats.onVacation} vacaciones · {todayStats.onLD} libre disposición
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">
            Coincidencias provinciales ({exerciseYear})
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold text-amber-700 tabular-nums">
            {provincialAlerts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Días con 2+ ausentes en la misma provincia
          </p>
        </div>
      </div>

      {/* Province Overview */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Vista por provincias de Castilla-La Mancha
            </h2>
            <p className="text-xs text-slate-500">
              Distribución territorial de plantilla activa y avisos de coincidencia
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" />
            <span>Haz clic en una provincia para filtrar el calendario</span>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {PROVINCES_CLM.map((prov) => {
            const provWorkers = activeWorkers.filter((w) => w.provincia === prov);
            const provAlerts = provincialAlerts.filter((a) => a.provincia === prov);
            const isSelected = provinceFilter === prov;
            return (
              <button
                key={prov}
                type="button"
                onClick={() =>
                  setProvinceFilter(isSelected ? 'TODAS' : prov)
                }
                className={`p-4 text-left transition-colors ${
                  isSelected ? 'bg-red-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">{prov}</span>
                  <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
                    {provWorkers.length} pers.
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {provWorkers.map((pw) => (
                    <p key={pw.worker_id} className="truncate text-xs text-slate-600">
                      {pw.nombre} {pw.apellidos}
                    </p>
                  ))}
                  {provWorkers.length === 0 && (
                    <p className="text-xs text-slate-400">Sin plantilla activa</p>
                  )}
                </div>
                {provAlerts.length > 0 && (
                  <p className="mt-2.5 text-xs font-medium text-amber-700">
                    {provAlerts.length} días con coincidencia
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* General Calendar (Monthly & Annual) */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Calendario general de disponibilidad ({exerciseYear})
              </h2>
              <p className="text-xs text-slate-500">
                Vista agregada sin detalle médico (Art. 9 RGPD) · V Vacaciones · L Libre disp. · C Cierre · A Ausencia · F Festivo
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={provinceFilter}
              onChange={(e) => setProvinceFilter(e.target.value as ProvinceCLM | 'TODAS')}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="TODAS">Todas las provincias</option>
              {PROVINCES_CLM.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="TODOS">Toda la plantilla</option>
              {activeWorkers.map((w) => (
                <option key={w.worker_id} value={w.worker_id}>
                  {w.nombre} {w.apellidos}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="vacaciones">Vacaciones y cierres</option>
              <option value="libre_disposicion">Libre disposición</option>
              <option value="ausencia">Ausencias</option>
            </select>

            <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setCalendarMode('mensual')}
                className={`rounded-md px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                  calendarMode === 'mensual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setCalendarMode('anual')}
                className={`rounded-md px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                  calendarMode === 'anual'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Anual
              </button>
            </div>
          </div>
        </div>

        {calendarMode === 'mensual' ? (
          <div className="p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => (m === 0 ? 11 : m - 1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-36 text-center text-sm font-semibold text-slate-900">
                  {MONTH_NAMES[calendarMonth]} {exerciseYear}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => (m === 11 ? 0 : m + 1))}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-red-700" /> Vacaciones
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-amber-600" /> Libre disp.
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-slate-800" /> Cierre
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded bg-slate-500" /> Ausencia
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 min-w-44">
                      Trabajador/a
                    </th>
                    {monthDays.map((d) => (
                      <th
                        key={d}
                        className="px-1 py-2 text-center font-mono font-medium text-slate-500 tabular-nums min-w-7"
                      >
                        {d.slice(8, 10)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredWorkers.map((w) => (
                    <tr key={w.worker_id} className="hover:bg-slate-50/70">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => onSelectWorker(w.worker_id)}
                          className="text-left hover:text-red-700 hover:underline"
                        >
                          {w.nombre} {w.apellidos}
                        </button>
                        <div className="text-[11px] font-normal text-slate-400">
                          {w.provincia}
                        </div>
                      </td>
                      {monthDays.map((d) => {
                        const mark = getWorkerDayMark(w.worker_id, d);
                        return (
                          <td key={d} className="p-0.5 text-center">
                            {mark ? (
                              <div
                                title={`${w.nombre} · ${formatDateES(d)}: ${mark.title}`}
                                className={`mx-auto flex h-6 w-6 items-center justify-center rounded font-mono text-[10px] font-semibold ${mark.cls}`}
                              >
                                {mark.code}
                              </div>
                            ) : (
                              <div className="mx-auto h-6 w-6 rounded border border-slate-100" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredWorkers.length === 0 && (
                    <tr>
                      <td
                        colSpan={monthDays.length + 1}
                        className="py-8 text-center text-slate-500"
                      >
                        No hay trabajadores activos para los filtros seleccionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            {MONTH_NAMES.map((mName, mIdx) => {
              const monthPrefix = `${exerciseYear}-${String(mIdx + 1).padStart(2, '0')}`;
              const vacInMonth = dataset.vacaciones.filter(
                (v) =>
                  v.estado !== 'anulado' &&
                  (v.fecha_inicio.startsWith(monthPrefix) || v.fecha_fin.startsWith(monthPrefix))
              ).length;
              const ldInMonth = dataset.libreDisposicion.filter(
                (l) =>
                  l.estado !== 'anulado' &&
                  (l.fecha_inicio.startsWith(monthPrefix) || l.fecha_fin.startsWith(monthPrefix))
              ).length;
              const abInMonth = dataset.ausencias.filter(
                (a) =>
                  a.estado !== 'anulado' &&
                  a.afecta_disponibilidad &&
                  (a.fecha_inicio.startsWith(monthPrefix) || a.fecha_fin.startsWith(monthPrefix))
              ).length;
              const holInMonth = dataset.festivos.filter(
                (f) => f.activo && f.fecha.startsWith(monthPrefix)
              ).length;

              return (
                <button
                  key={mName}
                  type="button"
                  onClick={() => {
                    setCalendarMonth(mIdx);
                    setCalendarMode('mensual');
                  }}
                  className="rounded-lg border border-slate-200 p-4 text-left hover:border-red-300 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">{mName}</span>
                    <span className="font-mono text-xs text-slate-400">{exerciseYear}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600 tabular-nums">
                    <div className="flex justify-between">
                      <span>Vacaciones / Cierres</span>
                      <span className="font-mono font-semibold text-red-700">{vacInMonth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Libre disposición</span>
                      <span className="font-mono font-semibold text-amber-700">{ldInMonth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ausencias</span>
                      <span className="font-mono font-semibold text-slate-700">{abInMonth}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Festivos generales</span>
                      <span className="font-mono font-semibold text-emerald-700">{holInMonth}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom 2 columns: Upcoming + Recent audit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Próximas vacaciones y ausencias
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('vacaciones')}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Gestionar
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {upcomingItems.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-4 px-6 py-3 text-xs"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onSelectWorker(it.workerId)}
                    className="font-semibold text-slate-900 hover:text-red-700 hover:underline truncate block"
                  >
                    {it.workerName}
                  </button>
                  <p className="text-slate-500">
                    {it.provincia} · {it.tipo}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-medium text-slate-900 tabular-nums">
                    {formatDateES(it.inicio)} – {formatDateES(it.fin)}
                  </p>
                  <p className="font-mono text-slate-500 tabular-nums">{it.dias}</p>
                </div>
              </div>
            ))}
            {upcomingItems.length === 0 && (
              <div className="px-6 py-10 text-center text-xs text-slate-500">
                No hay periodos próximos registrados todavía.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold text-slate-900">
              Últimos movimientos del histórico
            </h2>
            <button
              type="button"
              onClick={() => onNavigateTab('historico')}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Ver auditoría completa
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {recentAudit.map((m) => (
              <div
                key={m.movement_id}
                className="flex items-start justify-between gap-4 px-6 py-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    <span className="font-mono text-slate-500 mr-2">{m.movement_id}</span>
                    <span>{m.record_type}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="capitalize">{m.action}</span>
                  </p>
                  <p className="mt-0.5 truncate text-slate-500">{m.notes || m.record_id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-slate-600 tabular-nums">
                    {formatDateTimeES(m.timestamp)}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">{m.admin_id}</p>
                </div>
              </div>
            ))}
            {recentAudit.length === 0 && (
              <div className="px-6 py-10 text-center text-xs text-slate-500">
                Sin movimientos registrados en el histórico.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
