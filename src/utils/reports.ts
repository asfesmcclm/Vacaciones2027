import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  AbsenceRecord,
  Administrator,
  Exercise,
  LibreDisposicionRecord,
  ProvinceCLM,
  SpreadsheetDataset,
  VacationRecord,
  Worker,
} from '../types/sheets';
import {
  computeWorkerBalance,
  eachDateISO,
  formatDateES,
  formatDateTimeES,
  isExerciseProvisional,
  reconstructStateAtCutoff,
} from './calculations';

export type ReportTypeKey =
  | 'individual_anual'
  | 'individual_periodo'
  | 'estado_fecha_corte'
  | 'historico_individual'
  | 'resumen_provincial'
  | 'resumen_general'
  | 'disponibilidad'
  | 'consumo_saldos';

export const REPORT_TYPE_LABELS: Record<ReportTypeKey, string> = {
  individual_anual: 'Individual anual',
  individual_periodo: 'Individual por periodo',
  estado_fecha_corte: 'Estado a fecha de corte',
  historico_individual: 'Histórico individual',
  resumen_provincial: 'Resumen provincial',
  resumen_general: 'Resumen general',
  disponibilidad: 'Disponibilidad',
  consumo_saldos: 'Consumo de saldos',
};

export interface ReportRequest {
  type: ReportTypeKey;
  exerciseId: string;
  workerId?: string;
  provincia?: ProvinceCLM | 'TODAS';
  periodoInicio: string;
  periodoFin: string;
  fechaCorte?: string; // ISO date-time or YYYY-MM-DD
  includeAdminNotes: boolean;
  includeAuditHistory: boolean;
  canViewSensitiveAbsences: boolean;
}

export interface GeneratedReportPayload {
  title: string;
  subtitle: string;
  scopeLabel: string;
  exerciseLabel: string;
  periodLabel: string;
  cutoffLabel: string;
  generatedAtIso: string;
  provisionalNotice: string | null;
  summaryRows: Array<{ label: string; value: string }>;
  columns: string[];
  rows: string[][];
  secondaryTitle?: string;
  secondaryColumns?: string[];
  secondaryRows?: string[][];
}

export function buildReportPayload(
  dataset: SpreadsheetDataset,
  req: ReportRequest,
  admin: Administrator | null
): GeneratedReportPayload {
  const generatedAtIso = new Date().toISOString();
  const exercise: Exercise | undefined = dataset.ejercicios.find(
    (e) => e.exercise_id === req.exerciseId
  );
  const yearLabel = exercise ? String(exercise.anio) : req.exerciseId;

  // Determine source records: current state vs cutoff reconstruction
  const cutoffIso =
    req.fechaCorte && req.fechaCorte.trim() !== ''
      ? req.fechaCorte.length === 10
        ? `${req.fechaCorte}T23:59:59.999Z`
        : req.fechaCorte
      : null;

  const stateSource = cutoffIso
    ? reconstructStateAtCutoff(dataset, cutoffIso)
    : {
        vacaciones: dataset.vacaciones,
        libreDisposicion: dataset.libreDisposicion,
        ausencias: dataset.ausencias,
        saldos: dataset.saldos,
        movementsApplied: 0,
        usedHistoricalLog: false,
      };

  const provisional = isExerciseProvisional(exercise, dataset.cierres);
  const provisionalNotice = provisional
    ? 'DOCUMENTO PROVISIONAL: Cierres del 24/31 de diciembre pendientes de confirmación confederal o calendario laboral pendiente de validación oficial.'
    : null;

  const targetWorkers = dataset.personal.filter((w) => {
    if (req.workerId && w.worker_id !== req.workerId) return false;
    if (req.provincia && req.provincia !== 'TODAS' && w.provincia !== req.provincia) {
      return false;
    }
    return true;
  });

  const selectedWorker: Worker | undefined = req.workerId
    ? dataset.personal.find((w) => w.worker_id === req.workerId)
    : undefined;

  const scopeLabel = selectedWorker
    ? `${selectedWorker.nombre} ${selectedWorker.apellidos}`.trim() +
      ` (${selectedWorker.provincia}${selectedWorker.municipio ? ` · ${selectedWorker.municipio}` : ''})`
    : req.provincia && req.provincia !== 'TODAS'
    ? `Provincia: ${req.provincia}`
    : 'Toda la plantilla · Castilla-La Mancha';

  const cutoffLabel = cutoffIso
    ? `Fecha de corte histórica: ${formatDateTimeES(cutoffIso)}`
    : 'Estado actual (sin fecha de corte)';

  const periodLabel = `${formatDateES(req.periodoInicio)} – ${formatDateES(req.periodoFin)}`;

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: 'Organización', value: 'FeSMC UGT Castilla-La Mancha' },
    { label: 'Tipo de informe', value: REPORT_TYPE_LABELS[req.type] },
    { label: 'Ámbito / Trabajador', value: scopeLabel },
    { label: 'Ejercicio', value: yearLabel },
    { label: 'Periodo consultado', value: periodLabel },
    { label: 'Fecha de corte', value: cutoffLabel },
    { label: 'Fecha y hora de emisión', value: formatDateTimeES(generatedAtIso) },
    {
      label: 'Administrador responsable',
      value: admin ? `${admin.nombre_visible} (${admin.email})` : 'Administrador',
    },
  ];

  if (selectedWorker) {
    summaryRows.push({
      label: 'Fecha de incorporación',
      value: formatDateES(selectedWorker.fecha_incorporacion),
    });
  }

  let columns: string[] = [];
  let rows: string[][] = [];
  let secondaryTitle: string | undefined;
  let secondaryColumns: string[] | undefined;
  let secondaryRows: string[][] | undefined;

  const filterSensitiveAbsence = (ab: AbsenceRecord) => {
    if (ab.nivel_confidencialidad === 'restringido' && !req.canViewSensitiveAbsences) {
      return false;
    }
    return true;
  };

  if (req.type === 'individual_anual' || req.type === 'individual_periodo') {
    const worker = selectedWorker || targetWorkers[0];
    if (worker) {
      const bal = computeWorkerBalance({
        workerId: worker.worker_id,
        exerciseId: req.exerciseId,
        saldos: stateSource.saldos,
        vacaciones: stateSource.vacaciones,
        libreDisposicion: stateSource.libreDisposicion,
        ausencias: stateSource.ausencias,
        cierres: dataset.cierres,
      });

      summaryRows.push(
        {
          label: 'Vacaciones asignadas / libres elegibles',
          value: `${bal.vacacionesTotalAsignado} días (${bal.vacacionesLibresElegibles} libres tras ${bal.cierresDescontados} cierres)`,
        },
        {
          label: 'Vacaciones disfrutadas / pendientes',
          value: `${bal.vacacionesConsumidas} consumidos · ${bal.vacacionesPendientes} pendientes`,
        },
        {
          label: 'Libre disposición (asignado / usado / pendiente)',
          value: `${bal.ldTotalAsignado} / ${bal.ldConsumidos} / ${bal.ldPendientes}`,
        }
      );

      columns = [
        'ID',
        'Concepto',
        'Inicio',
        'Fin',
        'Días hábiles / desc.',
        'Estado',
        'Observaciones',
      ];

      const inPeriod = (start: string, end: string) =>
        req.type === 'individual_anual'
          ? start.startsWith(yearLabel) || end.startsWith(yearLabel)
          : start <= req.periodoFin && end >= req.periodoInicio;

      const vacRows = stateSource.vacaciones
        .filter((v) => v.worker_id === worker.worker_id && inPeriod(v.fecha_inicio, v.fecha_fin))
        .map((v: VacationRecord) => [
          v.vacation_id,
          v.tipo === 'cierre' ? 'Cierre confederal' : 'Vacaciones',
          formatDateES(v.fecha_inicio),
          formatDateES(v.fecha_fin),
          String(v.dias_habiles_calculados),
          v.estado,
          req.includeAdminNotes ? v.observaciones : '—',
        ]);

      const ldRows = stateSource.libreDisposicion
        .filter((l) => l.worker_id === worker.worker_id && inPeriod(l.fecha_inicio, l.fecha_fin))
        .map((l: LibreDisposicionRecord) => [
          l.leave_id,
          'Libre disposición',
          formatDateES(l.fecha_inicio),
          formatDateES(l.fecha_fin),
          String(l.dias_descontados),
          l.estado,
          req.includeAdminNotes ? l.observaciones : '—',
        ]);

      const abRows = stateSource.ausencias
        .filter(
          (a) =>
            a.worker_id === worker.worker_id &&
            inPeriod(a.fecha_inicio, a.fecha_fin) &&
            filterSensitiveAbsence(a)
        )
        .map((a: AbsenceRecord) => [
          a.absence_id,
          a.tipo_ausencia === 'ausencia'
            ? 'Ausencia (categoría neutra)'
            : a.tipo_ausencia.replace('_', ' '),
          formatDateES(a.fecha_inicio),
          formatDateES(a.fecha_fin),
          `${a.dias_naturales} nat.`,
          a.estado,
          req.includeAdminNotes ? a.observaciones_minimas : '—',
        ]);

      rows = [...vacRows, ...ldRows, ...abRows];

      if (req.includeAuditHistory) {
        const workerHistory = dataset.historico.filter(
          (h) => h.worker_id === worker.worker_id && (!cutoffIso || h.timestamp <= cutoffIso)
        );
        secondaryTitle = 'Histórico individual de movimientos';
        secondaryColumns = ['Movimiento', 'Fecha y hora', 'Admin', 'Tipo', 'Acción', 'Notas'];
        secondaryRows = workerHistory.map((h) => [
          h.movement_id,
          formatDateTimeES(h.timestamp),
          h.admin_id,
          h.record_type,
          h.action,
          h.notes,
        ]);
      }
    }
  } else if (req.type === 'historico_individual') {
    const worker = selectedWorker || targetWorkers[0];
    columns = ['ID Mov.', 'Fecha y hora', 'Admin', 'Tipo registro', 'ID Registro', 'Acción', 'Notas'];
    const filtered = dataset.historico.filter(
      (h) =>
        (!worker || h.worker_id === worker.worker_id) &&
        (!cutoffIso || h.timestamp <= cutoffIso)
    );
    rows = filtered.map((h) => [
      h.movement_id,
      formatDateTimeES(h.timestamp),
      h.admin_id,
      h.record_type,
      h.record_id,
      h.action,
      h.notes,
    ]);
  } else if (req.type === 'disponibilidad') {
    const dates = eachDateISO(req.periodoInicio, req.periodoFin).slice(0, 62);
    columns = ['Fecha', 'Activos', 'Disponibles', 'Vacaciones / Cierre', 'Libre Disp.', 'Otras ausencias'];
    const activeWorkers = targetWorkers.filter((w) => w.estado === 'activo');

    rows = dates.map((d) => {
      let vacCount = 0;
      let ldCount = 0;
      let abCount = 0;
      activeWorkers.forEach((w) => {
        if (
          stateSource.vacaciones.some(
            (v) =>
              v.worker_id === w.worker_id &&
              v.estado !== 'anulado' &&
              v.fecha_inicio <= d &&
              v.fecha_fin >= d
          )
        ) {
          vacCount++;
        } else if (
          stateSource.libreDisposicion.some(
            (l) =>
              l.worker_id === w.worker_id &&
              l.estado !== 'anulado' &&
              l.fecha_inicio <= d &&
              l.fecha_fin >= d
          )
        ) {
          ldCount++;
        } else if (
          stateSource.ausencias.some(
            (a) =>
              a.worker_id === w.worker_id &&
              a.estado !== 'anulado' &&
              a.afecta_disponibilidad &&
              a.fecha_inicio <= d &&
              a.fecha_fin >= d
          )
        ) {
          abCount++;
        }
      });
      const disponibles = Math.max(0, activeWorkers.length - vacCount - ldCount - abCount);
      return [
        formatDateES(d),
        String(activeWorkers.length),
        String(disponibles),
        String(vacCount),
        String(ldCount),
        String(abCount),
      ];
    });
  } else {
    // resumen_provincial | resumen_general | consumo_saldos | estado_fecha_corte
    columns = [
      'ID',
      'Trabajador/a',
      'Provincia',
      'Municipio',
      'Estado',
      'Vac. Asig.',
      'Cierres',
      'Vac. Usadas',
      'Vac. Pend.',
      'LD Asig.',
      'LD Usados',
      'LD Pend.',
    ];

    rows = targetWorkers.map((w) => {
      const bal = computeWorkerBalance({
        workerId: w.worker_id,
        exerciseId: req.exerciseId,
        saldos: stateSource.saldos,
        vacaciones: stateSource.vacaciones,
        libreDisposicion: stateSource.libreDisposicion,
        ausencias: stateSource.ausencias,
        cierres: dataset.cierres,
      });
      return [
        w.worker_id,
        `${w.nombre} ${w.apellidos}`.trim(),
        w.provincia,
        w.municipio || 'Pendiente',
        w.estado,
        String(bal.vacacionesTotalAsignado),
        String(bal.cierresDescontados),
        String(bal.vacacionesConsumidas),
        String(bal.vacacionesPendientes),
        String(bal.ldTotalAsignado),
        String(bal.ldConsumidos),
        String(bal.ldPendientes),
      ];
    });

    if (req.type === 'estado_fecha_corte') {
      secondaryTitle = 'Registros vigentes en la fecha de corte';
      secondaryColumns = ['ID', 'Trabajador', 'Tipo', 'Inicio', 'Fin', 'Días', 'Estado'];
      const workerNames = new Map(
        dataset.personal.map((w) => [w.worker_id, `${w.nombre} ${w.apellidos}`.trim()])
      );
      const activeVacs = stateSource.vacaciones
        .filter((v) => v.estado !== 'anulado')
        .map((v) => [
          v.vacation_id,
          workerNames.get(v.worker_id) || v.worker_id,
          v.tipo === 'cierre' ? 'Cierre' : 'Vacaciones',
          formatDateES(v.fecha_inicio),
          formatDateES(v.fecha_fin),
          String(v.dias_habiles_calculados),
          v.estado,
        ]);
      const activeLds = stateSource.libreDisposicion
        .filter((l) => l.estado !== 'anulado')
        .map((l) => [
          l.leave_id,
          workerNames.get(l.worker_id) || l.worker_id,
          'Libre Disposición',
          formatDateES(l.fecha_inicio),
          formatDateES(l.fecha_fin),
          String(l.dias_descontados),
          l.estado,
        ]);
      secondaryRows = [...activeVacs, ...activeLds];
    }
  }

  return {
    title: `Informe · ${REPORT_TYPE_LABELS[req.type]}`,
    subtitle: 'Sistema de Gestión de Vacaciones, Ausencias e Informes · FeSMC UGT CLM',
    scopeLabel,
    exerciseLabel: yearLabel,
    periodLabel,
    cutoffLabel,
    generatedAtIso,
    provisionalNotice,
    summaryRows,
    columns,
    rows,
    secondaryTitle,
    secondaryColumns,
    secondaryRows,
  };
}

export function generatePdfBlob(payload: GeneratedReportPayload): Blob {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Institutional header bar
  doc.setFillColor(153, 27, 27);
  doc.rect(0, 0, pageWidth, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text('FeSMC UGT Castilla-La Mancha', 14, 10);
  doc.setFontSize(10);
  doc.text(payload.title, 14, 17);

  doc.setTextColor(15, 23, 42);
  let y = 28;

  if (payload.provisionalNotice) {
    doc.setFillColor(254, 243, 199);
    doc.rect(14, y, pageWidth - 28, 10, 'F');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14);
    doc.text(payload.provisionalNotice, 17, y + 6.5);
    y += 14;
    doc.setTextColor(15, 23, 42);
  }

  autoTable(doc, {
    startY: y,
    head: [['Campo de control', 'Valor']],
    body: payload.summaryRows.map((s) => [s.label, s.value]),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
    margin: { left: 14, right: 14 },
  });

  const afterMetaY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 35;

  autoTable(doc, {
    startY: afterMetaY + 6,
    head: [payload.columns],
    body: payload.rows.length > 0 ? payload.rows : [['Sin registros para los filtros seleccionados']],
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 2.2 },
    headStyles: { fillColor: [153, 27, 27], textColor: 255 },
    margin: { left: 14, right: 14 },
  });

  if (payload.secondaryTitle && payload.secondaryColumns && payload.secondaryRows) {
    const afterMainY =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 120;
    doc.setFontSize(10);
    doc.text(payload.secondaryTitle, 14, afterMainY + 8);
    autoTable(doc, {
      startY: afterMainY + 11,
      head: [payload.secondaryColumns],
      body:
        payload.secondaryRows.length > 0
          ? payload.secondaryRows
          : [['Sin registros asociados']],
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      margin: { left: 14, right: 14 },
    });
  }

  // Page numbering footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Emitido: ${formatDateTimeES(payload.generatedAtIso)} · ${payload.cutoffLabel}`,
      14,
      doc.internal.pageSize.getHeight() - 7
    );
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - 34,
      doc.internal.pageSize.getHeight() - 7
    );
  }

  return doc.output('blob');
}

export function generateXlsxBlob(payload: GeneratedReportPayload): Blob {
  const wb = XLSX.utils.book_new();
  const metaSheetData = [
    ['FeSMC UGT Castilla-La Mancha — Ficha de Informe'],
    ...(payload.provisionalNotice ? [['AVISO', payload.provisionalNotice]] : []),
    ...payload.summaryRows.map((s) => [s.label, s.value]),
  ];
  const wsMeta = XLSX.utils.aoa_to_sheet(metaSheetData);
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Cabecera');

  const wsMain = XLSX.utils.aoa_to_sheet([payload.columns, ...payload.rows]);
  XLSX.utils.book_append_sheet(wb, wsMain, 'Datos');

  if (payload.secondaryTitle && payload.secondaryColumns && payload.secondaryRows) {
    const wsSec = XLSX.utils.aoa_to_sheet([
      payload.secondaryColumns,
      ...payload.secondaryRows,
    ]);
    XLSX.utils.book_append_sheet(wb, wsSec, 'Detalle_Historico');
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function generateCsvBlob(payload: GeneratedReportPayload): Blob {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ...payload.summaryRows.map((s) => [escape(s.label), escape(s.value)].join(',')),
    '',
    payload.columns.map(escape).join(','),
    ...payload.rows.map((r) => r.map(escape).join(',')),
  ];
  return new Blob(['\uFEFF' + lines.join('\n')], {
    type: 'text/csv;charset=utf-8;',
  });
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
