import {
  AbsenceCategory,
  AbsenceRecord,
  AdminRole,
  Administrator,
  AdminStatus,
  AuditAction,
  AuditMovement,
  BalanceConcept,
  BalanceRecord,
  ClosureReason,
  ClosureRecord,
  ClosureStatus,
  ConfigEntry,
  ConfidentialityLevel,
  DiscountRule,
  Exercise,
  ExerciseStatus,
  GeneratedReportRecord,
  HolidayRecord,
  HolidayScope,
  LibreDisposicionRecord,
  LocalHolidayRecord,
  ProvinceCLM,
  RecordStatus,
  ReportFormat,
  SheetTabName,
  SpreadsheetDataset,
  VacationRecord,
  VacationType,
  Worker,
  WorkerStatus,
} from '../types/sheets';
import { buildInitialSeedRows, SHEET_TABS } from './sheetSchema';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export class SheetsApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!res.ok) {
    let detail = `Error ${res.status} en Google Sheets API`;
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || detail;
    } catch {
      // ignore json parse
    }
    throw new SheetsApiError(detail, res.status);
  }

  return res.json() as Promise<T>;
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

export async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic fallback if SubtleCrypto unavailable
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function toBool(val: string | undefined): boolean {
  return String(val || '').trim().toUpperCase() === 'TRUE';
}

function toNum(val: string | undefined, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function parseTabRows(rawTabs: Record<SheetTabName, string[][]>) {
  const personal: Worker[] = (rawTabs.PERSONAL || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    worker_id: r[0] || '',
    nombre: r[1] || '',
    apellidos: r[2] || '',
    provincia: (r[3] as ProvinceCLM) || 'Toledo',
    municipio: r[4] || '',
    fecha_incorporacion: r[5] || '',
    estado: (r[6] as WorkerStatus) || 'activo',
    fecha_alta_sistema: r[7] || '',
    fecha_baja: r[8] || '',
    observaciones_administrativas: r[9] || '',
  })).filter((w) => w.worker_id);

  const administradores: Administrator[] = (rawTabs.ADMINISTRADORES || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    admin_id: r[0] || '',
    nombre_visible: r[1] || '',
    email: r[2] || '',
    rol: (r[3] as AdminRole) || 'ADMIN_GESTION',
    puede_ver_ausencias_sensibles: toBool(r[4]),
    estado: (r[5] as AdminStatus) || 'activo',
    fecha_alta: r[6] || '',
    fecha_baja: r[7] || '',
  })).filter((a) => a.admin_id || a.email);

  const ejercicios: Exercise[] = (rawTabs.EJERCICIOS || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    exercise_id: r[0] || '',
    anio: toNum(r[1], 2027),
    fecha_inicio: r[2] || '',
    fecha_fin: r[3] || '',
    estado: (r[4] as ExerciseStatus) || 'activo',
    vacaciones_referencia: toNum(r[5], 25),
    libre_disposicion_referencia: toNum(r[6], 3),
    notas: r[7] || '',
    validado_calendario: toBool(r[8]),
  })).filter((e) => e.exercise_id);

  const saldos: BalanceRecord[] = (rawTabs.SALDOS || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    balance_id: r[0] || '',
    worker_id: r[1] || '',
    exercise_id: r[2] || '',
    concepto: (r[3] as BalanceConcept) || 'vacaciones',
    dias_asignados: toNum(r[4], 0),
    ajustes: toNum(r[5], 0),
    motivo_ajuste: r[6] || '',
    fecha_asignacion: r[7] || '',
    admin_id: r[8] || '',
    observaciones: r[9] || '',
  })).filter((s) => s.balance_id);

  const vacaciones: VacationRecord[] = (rawTabs.VACACIONES || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    vacation_id: r[0] || '',
    worker_id: r[1] || '',
    exercise_id: r[2] || '',
    tipo: (r[3] as VacationType) || 'vacaciones',
    fecha_inicio: r[4] || '',
    fecha_fin: r[5] || '',
    dias_habiles_calculados: toNum(r[6], 0),
    estado: (r[7] as RecordStatus) || 'planificada',
    observaciones: r[8] || '',
    created_at: r[9] || '',
    updated_at: r[10] || '',
    created_by: r[11] || '',
    updated_by: r[12] || '',
  })).filter((v) => v.vacation_id);

  const libreDisposicion: LibreDisposicionRecord[] = (rawTabs.LIBRE_DISPOSICION || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    leave_id: r[0] || '',
    worker_id: r[1] || '',
    exercise_id: r[2] || '',
    fecha_inicio: r[3] || '',
    fecha_fin: r[4] || '',
    dias_descontados: toNum(r[5], 0),
    estado: (r[6] as RecordStatus) || 'planificada',
    observaciones: r[7] || '',
    created_at: r[8] || '',
    updated_at: r[9] || '',
    created_by: r[10] || '',
    updated_by: r[11] || '',
  })).filter((l) => l.leave_id);

  const ausencias: AbsenceRecord[] = (rawTabs.AUSENCIAS || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    absence_id: r[0] || '',
    worker_id: r[1] || '',
    tipo_ausencia: (r[2] as AbsenceCategory) || 'ausencia',
    fecha_inicio: r[3] || '',
    fecha_fin: r[4] || '',
    dias_naturales: toNum(r[5], 0),
    estado: (r[6] as RecordStatus) || 'confirmado',
    afecta_disponibilidad: toBool(r[7]),
    regla_descuento: (r[8] as DiscountRule) || 'no_descuenta',
    observaciones_minimas: r[9] || '',
    nivel_confidencialidad: (r[10] as ConfidentialityLevel) || 'restringido',
    created_at: r[11] || '',
    updated_at: r[12] || '',
    created_by: r[13] || '',
    updated_by: r[14] || '',
  })).filter((a) => a.absence_id);

  const festivos: HolidayRecord[] = (rawTabs.FESTIVOS || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    holiday_id: r[0] || '',
    exercise_id: r[1] || '',
    fecha: r[2] || '',
    nombre: r[3] || '',
    ambito: (r[4] as HolidayScope) || 'nacional',
    territorio: r[5] || '',
    activo: toBool(r[6]),
    fuente_validacion: r[7] || '',
  })).filter((f) => f.holiday_id);

  const festivosLocales: LocalHolidayRecord[] = (rawTabs.FESTIVOS_LOCALES || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    local_holiday_id: r[0] || '',
    exercise_id: r[1] || '',
    municipio: r[2] || '',
    provincia: (r[3] as ProvinceCLM) || 'Toledo',
    fecha: r[4] || '',
    nombre: r[5] || '',
    activo: toBool(r[6]),
    fuente_validacion: r[7] || '',
  })).filter((fl) => fl.local_holiday_id);

  const historico: AuditMovement[] = (rawTabs.HISTORICO || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    movement_id: r[0] || '',
    timestamp: r[1] || '',
    admin_id: r[2] || '',
    worker_id: r[3] || '',
    province_snapshot: r[4] || '',
    record_type: r[5] || '',
    record_id: r[6] || '',
    action: (r[7] as AuditAction) || 'alta',
    old_values: r[8] || '',
    new_values: r[9] || '',
    notes: r[10] || '',
    hash_prev: r[11] || '',
  })).filter((h) => h.movement_id);

  const informesGenerados: GeneratedReportRecord[] = (rawTabs.INFORMES_GENERADOS || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    report_id: r[0] || '',
    tipo_informe: r[1] || '',
    ambito: r[2] || '',
    exercise_id: r[3] || '',
    fecha_corte: r[4] || '',
    periodo_inicio: r[5] || '',
    periodo_fin: r[6] || '',
    generated_at: r[7] || '',
    admin_id: r[8] || '',
    formato: (r[9] as ReportFormat) || 'PDF',
    drive_file_id: r[10] || '',
    drive_web_url: r[11] || '',
    estado: r[12] || 'emitido',
  })).filter((rep) => rep.report_id);

  const configuracion: ConfigEntry[] = (rawTabs.CONFIGURACION || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    config_key: r[0] || '',
    config_value: r[1] || '',
    descripcion: r[2] || '',
    vigencia_desde: r[3] || '',
    vigencia_hasta: r[4] || '',
    modified_at: r[5] || '',
    modified_by: r[6] || '',
  })).filter((c) => c.config_key);

  const cierres: ClosureRecord[] = (rawTabs.CIERRES || []).slice(1).map((r, i) => ({
    _rowIndex: i + 2,
    closure_id: r[0] || '',
    exercise_id: r[1] || '',
    fecha_original: r[2] || '',
    fecha_efectiva: r[3] || '',
    motivo: (r[4] as ClosureReason) || 'laborable',
    estado: (r[5] as ClosureStatus) || 'pendiente',
    fuente: r[6] || '',
    referencia: r[7] || '',
    fecha_comunicacion: r[8] || '',
    admin_id: r[9] || '',
    created_at: r[10] || '',
    updated_at: r[11] || '',
  })).filter((c) => c.closure_id);

  return {
    personal,
    administradores,
    ejercicios,
    saldos,
    vacaciones,
    libreDisposicion,
    ausencias,
    festivos,
    festivosLocales,
    historico,
    informesGenerados,
    configuracion,
    cierres,
  };
}

interface SpreadsheetMetadataResponse {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties: { title: string };
  sheets: Array<{
    properties: {
      sheetId: number;
      title: string;
    };
  }>;
}

export async function createStructuredSpreadsheet(
  accessToken: string,
  adminEmail: string,
  adminName: string
): Promise<SpreadsheetDataset> {
  const nowIso = new Date().toISOString();
  const sheetTitle = 'FeSMC UGT CLM · Gestión de Vacaciones, Ausencias e Informes';

  const createBody = {
    properties: {
      title: sheetTitle,
      locale: 'es_ES',
      timeZone: 'Europe/Madrid',
    },
    sheets: SHEET_TABS.map((tab, idx) => ({
      properties: {
        sheetId: idx + 1,
        title: tab.name,
        gridProperties: {
          frozenRowCount: 1,
        },
      },
    })),
  };

  const created = await sheetsFetch<SpreadsheetMetadataResponse>(
    SHEETS_BASE,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify(createBody),
    }
  );

  const spreadsheetId = created.spreadsheetId;
  const seedRows = buildInitialSeedRows(adminEmail, adminName, nowIso);

  // Build initial HISTORICO movement with genesis hash
  const genesisPayload = JSON.stringify({
    spreadsheetId,
    workers: seedRows.PERSONAL.length,
    exercise: 'EX-2027',
    initializedBy: adminEmail,
  });
  const genesisHash = await sha256Hex(`GENESIS|${nowIso}|${genesisPayload}`);
  seedRows.HISTORICO = [
    [
      'MOV-000001',
      nowIso,
      'ADM-001',
      'PLANTILLA',
      'CLM',
      'SISTEMA',
      spreadsheetId,
      'inicializacion',
      '',
      genesisPayload,
      'Inicialización automática de la estructura de 13 pestañas (Ficha Técnica v2.3)',
      genesisHash,
    ],
  ];

  // Format headers across all 13 sheets via batchUpdate
  const formatRequests = SHEET_TABS.map((tab, idx) => ({
    repeatCell: {
      range: {
        sheetId: idx + 1,
        startRowIndex: 0,
        endRowIndex: 1,
        startColumnIndex: 0,
        endColumnIndex: tab.headers.length,
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.6, green: 0.11, blue: 0.11 },
          textFormat: {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
            fontSize: 10,
          },
          horizontalAlignment: 'LEFT',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  }));

  await sheetsFetch(
    `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ requests: formatRequests }),
    }
  );

  // Batch write headers + initial seed data
  const valueData = SHEET_TABS.map((tab) => ({
    range: `'${tab.name}'!A1`,
    majorDimension: 'ROWS',
    values: [tab.headers, ...(seedRows[tab.name] || [])],
  }));

  await sheetsFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueData,
      }),
    }
  );

  return loadAllTabs(accessToken, spreadsheetId);
}

export async function connectAndVerifySpreadsheet(
  accessToken: string,
  spreadsheetIdOrUrl: string,
  adminEmail: string,
  adminName: string
): Promise<{
  dataset: SpreadsheetDataset;
  createdTabs: SheetTabName[];
}> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Introduce un ID o URL válido de Google Sheets.');
  }

  const meta = await sheetsFetch<SpreadsheetMetadataResponse>(
    `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  const existingTitles = new Set(meta.sheets.map((s) => s.properties.title));
  const missingTabs = SHEET_TABS.filter((t) => !existingTitles.has(t.name));

  const createdTabs: SheetTabName[] = [];

  if (missingTabs.length > 0) {
    const addRequests = missingTabs.map((tab) => ({
      addSheet: {
        properties: {
          title: tab.name,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      },
    }));

    const addResp = await sheetsFetch<{
      replies: Array<{ addSheet?: { properties: { sheetId: number; title: string } } }>;
    }>(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ requests: addRequests }),
    });

    const nowIso = new Date().toISOString();
    const seedRows = buildInitialSeedRows(adminEmail, adminName, nowIso);

    const headerData = missingTabs.map((tab) => ({
      range: `'${tab.name}'!A1`,
      majorDimension: 'ROWS',
      values: [
        tab.headers,
        // Only seed initial rows if we are creating the tab fresh
        ...(tab.name === 'HISTORICO' ? [] : seedRows[tab.name] || []),
      ],
    }));

    await sheetsFetch(
      `${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: headerData,
        }),
      }
    );

    // Format headers on newly added sheets
    const formatReqs = (addResp.replies || [])
      .map((rep, idx) => {
        const sid = rep.addSheet?.properties.sheetId;
        const tab = missingTabs[idx];
        if (!sid || !tab) return null;
        return {
          repeatCell: {
            range: {
              sheetId: sid,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: tab.headers.length,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.6, green: 0.11, blue: 0.11 },
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 10,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        };
      })
      .filter(Boolean);

    if (formatReqs.length > 0) {
      await sheetsFetch(
        `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify({ requests: formatReqs }),
        }
      );
    }

    missingTabs.forEach((t) => createdTabs.push(t.name));
  }

  const dataset = await loadAllTabs(accessToken, spreadsheetId);
  return { dataset, createdTabs };
}

export async function loadAllTabs(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetDataset> {
  const meta = await sheetsFetch<SpreadsheetMetadataResponse>(
    `${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)`,
    accessToken
  );

  const existingTitles = new Set(meta.sheets.map((s) => s.properties.title));
  const tabsToFetch = SHEET_TABS.filter((t) => existingTitles.has(t.name));

  const rawTabs: Record<SheetTabName, string[][]> = {
    PERSONAL: [],
    ADMINISTRADORES: [],
    EJERCICIOS: [],
    SALDOS: [],
    VACACIONES: [],
    LIBRE_DISPOSICION: [],
    AUSENCIAS: [],
    FESTIVOS: [],
    FESTIVOS_LOCALES: [],
    HISTORICO: [],
    INFORMES_GENERADOS: [],
    CONFIGURACION: [],
    CIERRES: [],
  };

  if (tabsToFetch.length > 0) {
    const rangesQuery = tabsToFetch
      .map((t) => `ranges=${encodeURIComponent(`'${t.name}'!A:Z`)}`)
      .join('&');

    const batchRes = await sheetsFetch<{
      valueRanges?: Array<{ range: string; values?: string[][] }>;
    }>(`${SHEETS_BASE}/${spreadsheetId}/values:batchGet?${rangesQuery}`, accessToken);

    (batchRes.valueRanges || []).forEach((vr, idx) => {
      const tab = tabsToFetch[idx];
      if (tab) {
        rawTabs[tab.name] = vr.values || [];
      }
    });
  }

  const parsed = parseTabRows(rawTabs);

  return {
    spreadsheetId: meta.spreadsheetId,
    spreadsheetTitle: meta.properties.title,
    spreadsheetUrl:
      meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${meta.spreadsheetId}`,
    lastSyncedAt: new Date().toISOString(),
    ...parsed,
    rawTabs,
  };
}

export async function appendTabRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: SheetTabName,
  rows: (string | number | boolean)[][]
): Promise<void> {
  const formattedRows = rows.map((r) => r.map((cell) => String(cell ?? '')));
  await sheetsFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(`'${tabName}'!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: formattedRows,
      }),
    }
  );
}

export async function updateTabRow(
  accessToken: string,
  spreadsheetId: string,
  tabName: SheetTabName,
  rowIndex1Based: number,
  rowValues: (string | number | boolean)[]
): Promise<void> {
  const formatted = rowValues.map((cell) => String(cell ?? ''));
  const range = `'${tabName}'!A${rowIndex1Based}`;
  await sheetsFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [formatted],
      }),
    }
  );
}

export async function appendAuditMovement(
  accessToken: string,
  spreadsheetId: string,
  existingHistory: AuditMovement[],
  params: {
    adminId: string;
    workerId: string;
    provinceSnapshot: string;
    recordType: string;
    recordId: string;
    action: AuditAction;
    oldValues: Record<string, unknown> | null;
    newValues: Record<string, unknown> | null;
    notes: string;
  }
): Promise<void> {
  const nowIso = new Date().toISOString();
  const nextNum = existingHistory.length + 1;
  const movementId = `MOV-${String(nextNum).padStart(6, '0')}`;
  const lastHash =
    existingHistory.length > 0
      ? existingHistory[existingHistory.length - 1].hash_prev
      : 'GENESIS';

  const oldStr = params.oldValues ? JSON.stringify(params.oldValues) : '';
  const newStr = params.newValues ? JSON.stringify(params.newValues) : '';

  const payloadToHash = `${lastHash}|${movementId}|${nowIso}|${params.adminId}|${params.workerId}|${params.recordType}|${params.recordId}|${params.action}|${oldStr}|${newStr}`;
  const chainHash = await sha256Hex(payloadToHash);

  await appendTabRows(accessToken, spreadsheetId, 'HISTORICO', [
    [
      movementId,
      nowIso,
      params.adminId,
      params.workerId,
      params.provinceSnapshot,
      params.recordType,
      params.recordId,
      params.action,
      oldStr,
      newStr,
      params.notes,
      chainHash,
    ],
  ]);
}
