import React, { useMemo, useState } from 'react';
import {
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  History,
} from 'lucide-react';
import {
  Administrator,
  PendingMutation,
  PROVINCES_CLM,
  ProvinceCLM,
  ReportFormat,
  SpreadsheetDataset,
} from '../types/sheets';
import {
  buildReportPayload,
  generateCsvBlob,
  generatePdfBlob,
  generateXlsxBlob,
  REPORT_TYPE_LABELS,
  ReportTypeKey,
  triggerBlobDownload,
} from '../utils/reports';
import { formatDateES, formatDateTimeES } from '../utils/calculations';
import { uploadFileToDrive } from '../services/driveApi';
import { appendAuditMovement, appendTabRows } from '../services/sheetsApi';

interface ReportsViewProps {
  dataset: SpreadsheetDataset;
  selectedExerciseId: string;
  currentAdmin: Administrator | null;
  accessToken: string;
  initialWorkerId?: string | null;
  onRequestMutation: (mutation: PendingMutation) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  dataset,
  selectedExerciseId,
  currentAdmin,
  accessToken,
  initialWorkerId,
  onRequestMutation,
}) => {
  const exercise = dataset.ejercicios.find(
    (e) => e.exercise_id === selectedExerciseId
  );
  const yearStr = String(exercise?.anio || 2027);

  const [reportType, setReportType] = useState<ReportTypeKey>(
    initialWorkerId ? 'individual_anual' : 'resumen_general'
  );
  const [workerId, setWorkerId] = useState<string>(
    initialWorkerId || dataset.personal[0]?.worker_id || 'W-001'
  );
  const [provincia, setProvincia] = useState<ProvinceCLM | 'TODAS'>('TODAS');
  const [periodoInicio, setPeriodoInicio] = useState(`${yearStr}-01-01`);
  const [periodoFin, setPeriodoFin] = useState(`${yearStr}-12-31`);
  const [useCutoff, setUseCutoff] = useState(false);
  const [cutoffDate, setCutoffDate] = useState(new Date().toISOString().slice(0, 10));
  const [cutoffTime, setCutoffTime] = useState('23:59');
  const [includeAdminNotes, setIncludeAdminNotes] = useState(true);
  const [includeAuditHistory, setIncludeAuditHistory] = useState(false);
  const [archiveFormat, setArchiveFormat] = useState<ReportFormat>('PDF');

  const canViewSensitive = currentAdmin?.puede_ver_ausencias_sensibles ?? false;
  const adminId = currentAdmin?.admin_id || 'ADM-001';

  const needsWorker =
    reportType === 'individual_anual' ||
    reportType === 'individual_periodo' ||
    reportType === 'historico_individual';

  const payload = useMemo(() => {
    const fechaCorte = useCutoff && cutoffDate ? `${cutoffDate}T${cutoffTime}:59.000Z` : undefined;
    return buildReportPayload(
      dataset,
      {
        type: reportType,
        exerciseId: selectedExerciseId,
        workerId: needsWorker ? workerId : undefined,
        provincia: !needsWorker ? provincia : undefined,
        periodoInicio,
        periodoFin,
        fechaCorte,
        includeAdminNotes,
        includeAuditHistory,
        canViewSensitiveAbsences: canViewSensitive,
      },
      currentAdmin
    );
  }, [
    dataset,
    reportType,
    selectedExerciseId,
    needsWorker,
    workerId,
    provincia,
    periodoInicio,
    periodoFin,
    useCutoff,
    cutoffDate,
    cutoffTime,
    includeAdminNotes,
    includeAuditHistory,
    canViewSensitive,
    currentAdmin,
  ]);

  const buildFileAndBlob = (fmt: ReportFormat) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const safeType = reportType.replace(/_/g, '-');
    if (fmt === 'PDF') {
      return {
        fileName: `FeSMC_UGT_CLM_${safeType}_${yearStr}_${stamp}.pdf`,
        mimeType: 'application/pdf',
        blob: generatePdfBlob(payload),
      };
    }
    if (fmt === 'XLSX') {
      return {
        fileName: `FeSMC_UGT_CLM_${safeType}_${yearStr}_${stamp}.xlsx`,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        blob: generateXlsxBlob(payload),
      };
    }
    return {
      fileName: `FeSMC_UGT_CLM_${safeType}_${yearStr}_${stamp}.csv`,
      mimeType: 'text/csv;charset=utf-8;',
      blob: generateCsvBlob(payload),
    };
  };

  const handleDownload = (fmt: ReportFormat) => {
    const { fileName, blob } = buildFileAndBlob(fmt);
    triggerBlobDownload(blob, fileName);
  };

  const handleArchiveToDrive = () => {
    const { fileName, mimeType, blob } = buildFileAndBlob(archiveFormat);
    const reportId = `REP-${yearStr}-${String(dataset.informesGenerados.length + 1).padStart(4, '0')}`;
    const fechaCorteVal =
      useCutoff && cutoffDate ? `${cutoffDate}T${cutoffTime}:59.000Z` : '';

    onRequestMutation({
      title: `Archivar informe en Google Drive (${archiveFormat})`,
      description: `Se subirá el archivo "${fileName}" a tu Google Drive y se registrará la referencia (${reportId}) en la pestaña INFORMES_GENERADOS de Google Sheets.`,
      affectedTarget: 'Google Drive + INFORMES_GENERADOS',
      affectedCountLabel: '1 archivo en Drive + 1 registro en INFORMES_GENERADOS + HISTORICO',
      execute: async () => {
        const uploaded = await uploadFileToDrive(
          accessToken,
          fileName,
          mimeType,
          blob,
          `${payload.title} · ${payload.scopeLabel} · Emitido ${formatDateTimeES(payload.generatedAtIso)}`
        );

        await appendTabRows(accessToken, dataset.spreadsheetId, 'INFORMES_GENERADOS', [
          [
            reportId,
            REPORT_TYPE_LABELS[reportType],
            payload.scopeLabel,
            selectedExerciseId,
            fechaCorteVal,
            periodoInicio,
            periodoFin,
            payload.generatedAtIso,
            adminId,
            archiveFormat,
            uploaded.id,
            uploaded.webViewLink,
            'archivado_drive',
          ],
        ]);

        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: needsWorker ? workerId : 'PLANTILLA',
          provinceSnapshot: needsWorker
            ? dataset.personal.find((w) => w.worker_id === workerId)?.provincia || 'CLM'
            : provincia,
          recordType: 'INFORMES_GENERADOS',
          recordId: reportId,
          action: 'alta',
          oldValues: null,
          newValues: {
            report_id: reportId,
            tipo: REPORT_TYPE_LABELS[reportType],
            formato: archiveFormat,
            drive_file_id: uploaded.id,
            fecha_corte: fechaCorteVal,
          },
          notes: `Informe ${archiveFormat} archivado en Drive (${fileName})`,
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Generador de informes y reconstrucción a fecha de corte (ap. 9)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              La fecha de corte reconstruye la situación exacta que constaba en{' '}
              <span className="font-mono">HISTORICO</span> en ese momento, sin alterar los días
              hábiles guardados en cada registro.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownload('PDF')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('XLSX')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownload('CSV')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>CSV</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />
            <select
              value={archiveFormat}
              onChange={(e) => setArchiveFormat(e.target.value as ReportFormat)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-800"
            >
              <option value="PDF">PDF</option>
              <option value="XLSX">XLSX</option>
              <option value="CSV">CSV</option>
            </select>
            <button
              type="button"
              onClick={handleArchiveToDrive}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800 whitespace-nowrap"
            >
              <CloudUpload className="h-3.5 w-3.5" />
              <span>Archivar en Google Drive</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Tipo de informe</label>
            <select
              value={reportType}
              onChange={(e) => {
                const next = e.target.value as ReportTypeKey;
                setReportType(next);
                if (next === 'estado_fecha_corte') setUseCutoff(true);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
            >
              {Object.entries(REPORT_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {needsWorker ? (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Trabajador/a</label>
              <select
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >
                {dataset.personal.map((w) => (
                  <option key={w.worker_id} value={w.worker_id}>
                    {w.nombre} {w.apellidos} ({w.provincia})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block font-medium text-slate-700 mb-1">Ámbito provincial</label>
              <select
                value={provincia}
                onChange={(e) => setProvincia(e.target.value as ProvinceCLM | 'TODAS')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >
                <option value="TODAS">Toda Castilla-La Mancha</option>
                {PROVINCES_CLM.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-medium text-slate-700 mb-1">Inicio periodo</label>
            <input
              type="date"
              value={periodoInicio}
              onChange={(e) => setPeriodoInicio(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Fin periodo</label>
            <input
              type="date"
              value={periodoFin}
              onChange={(e) => setPeriodoFin(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-slate-100 pt-4 text-xs">
          <label className="inline-flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={useCutoff}
              onChange={(e) => setUseCutoff(e.target.checked)}
            />
            <History className="h-3.5 w-3.5 text-slate-500" />
            <span>Aplicar fecha de corte histórica</span>
          </label>

          {useCutoff && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={cutoffDate}
                onChange={(e) => setCutoffDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900"
              />
              <input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-slate-900"
              />
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAdminNotes}
              onChange={(e) => setIncludeAdminNotes(e.target.checked)}
            />
            <span>Incluir observaciones administrativas</span>
          </label>

          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAuditHistory}
              onChange={(e) => setIncludeAuditHistory(e.target.checked)}
            />
            <span>Incluir histórico de movimientos</span>
          </label>
        </div>
      </section>

      {/* Live Preview */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{payload.title}</h3>
              <p className="text-xs text-slate-500">{payload.subtitle}</p>
            </div>
            <span className="font-mono text-xs text-slate-500">
              {payload.cutoffLabel}
            </span>
          </div>
          {payload.provisionalNotice && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {payload.provisionalNotice}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-b border-slate-200 px-6 py-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {payload.summaryRows.map((s) => (
            <div key={s.label} className="flex justify-between gap-3 py-1 border-b border-slate-100">
              <span className="text-slate-500">{s.label}</span>
              <span className="font-medium text-slate-900 text-right">{s.value}</span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                {payload.columns.map((col) => (
                  <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.rows.map((r, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70">
                  {r.map((cell, cIdx) => (
                    <td key={cIdx} className="px-4 py-2.5 text-slate-800 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {payload.rows.length === 0 && (
                <tr>
                  <td colSpan={payload.columns.length} className="py-10 text-center text-slate-500">
                    Sin datos para los parámetros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Generated Reports Archive Registry */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Registro de informes emitidos y archivados en Drive (INFORMES_GENERADOS)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-semibold">ID Informe</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Ámbito</th>
                <th className="px-4 py-3 font-semibold">Fecha corte</th>
                <th className="px-4 py-3 font-semibold">Emitido</th>
                <th className="px-4 py-3 font-semibold">Formato</th>
                <th className="px-4 py-3 font-semibold text-right">Google Drive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...dataset.informesGenerados].reverse().map((rep) => (
                <tr key={rep.report_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono">{rep.report_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{rep.tipo_informe}</td>
                  <td className="px-4 py-3 text-slate-700">{rep.ambito}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {rep.fecha_corte ? formatDateES(rep.fecha_corte) : 'Actual'}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600 tabular-nums">
                    {formatDateTimeES(rep.generated_at)}
                  </td>
                  <td className="px-4 py-3 font-mono">{rep.formato}</td>
                  <td className="px-4 py-3 text-right">
                    {rep.drive_web_url ? (
                      <a
                        href={rep.drive_web_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline"
                      >
                        <span>Abrir en Drive</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {dataset.informesGenerados.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Aún no se ha archivado ningún informe en Google Drive.
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
