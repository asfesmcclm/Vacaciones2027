export type ProvinceCLM =
  | 'Albacete'
  | 'Ciudad Real'
  | 'Cuenca'
  | 'Guadalajara'
  | 'Toledo';

export const PROVINCES_CLM: ProvinceCLM[] = [
  'Albacete',
  'Ciudad Real',
  'Cuenca',
  'Guadalajara',
  'Toledo',
];

export type WorkerStatus = 'activo' | 'inactivo' | 'archivado';
export type AdminRole = 'ADMIN_SUPER' | 'ADMIN_GESTION' | 'ADMIN_CONSULTA';
export type AdminStatus = 'activo' | 'inactivo';
export type ExerciseStatus = 'activo' | 'cerrado' | 'borrador';
export type BalanceConcept = 'vacaciones' | 'libre_disposicion';
export type VacationType = 'vacaciones' | 'cierre';
export type RecordStatus = 'planificada' | 'disfrutada' | 'confirmado' | 'pendiente' | 'anulado';
export type AbsenceCategory =
  | 'ausencia'
  | 'permiso_retribuido'
  | 'permiso_no_retribuido'
  | 'otra_ausencia';
export type DiscountRule = 'no_descuenta' | 'descuenta_vacaciones' | 'descuenta_ld' | 'configurable';
export type ConfidentialityLevel = 'normal' | 'restringido';
export type HolidayScope = 'nacional' | 'autonomico';
export type ClosureStatus = 'pendiente' | 'confirmado' | 'anulado';
export type ClosureReason = 'laborable' | 'sabado' | 'domingo' | 'festivo';
export type AuditAction = 'alta' | 'modificacion' | 'anulacion' | 'inicializacion';
export type ReportFormat = 'PDF' | 'XLSX' | 'CSV';

export interface Worker {
  _rowIndex?: number;
  worker_id: string;
  nombre: string;
  apellidos: string;
  provincia: ProvinceCLM;
  municipio: string;
  fecha_incorporacion: string;
  estado: WorkerStatus;
  fecha_alta_sistema: string;
  fecha_baja: string;
  observaciones_administrativas: string;
}

export interface Administrator {
  _rowIndex?: number;
  admin_id: string;
  nombre_visible: string;
  email: string;
  rol: AdminRole;
  puede_ver_ausencias_sensibles: boolean;
  estado: AdminStatus;
  fecha_alta: string;
  fecha_baja: string;
}

export interface Exercise {
  _rowIndex?: number;
  exercise_id: string;
  anio: number;
  fecha_inicio: string;
  fecha_fin: string;
  estado: ExerciseStatus;
  vacaciones_referencia: number;
  libre_disposicion_referencia: number;
  notas: string;
  validado_calendario: boolean;
}

export interface BalanceRecord {
  _rowIndex?: number;
  balance_id: string;
  worker_id: string;
  exercise_id: string;
  concepto: BalanceConcept;
  dias_asignados: number;
  ajustes: number;
  motivo_ajuste: string;
  fecha_asignacion: string;
  admin_id: string;
  observaciones: string;
}

export interface VacationRecord {
  _rowIndex?: number;
  vacation_id: string;
  worker_id: string;
  exercise_id: string;
  tipo: VacationType;
  fecha_inicio: string;
  fecha_fin: string;
  dias_habiles_calculados: number;
  estado: RecordStatus;
  observaciones: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface LibreDisposicionRecord {
  _rowIndex?: number;
  leave_id: string;
  worker_id: string;
  exercise_id: string;
  fecha_inicio: string;
  fecha_fin: string;
  dias_descontados: number;
  estado: RecordStatus;
  observaciones: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface AbsenceRecord {
  _rowIndex?: number;
  absence_id: string;
  worker_id: string;
  tipo_ausencia: AbsenceCategory;
  fecha_inicio: string;
  fecha_fin: string;
  dias_naturales: number;
  estado: RecordStatus;
  afecta_disponibilidad: boolean;
  regla_descuento: DiscountRule;
  observaciones_minimas: string;
  nivel_confidencialidad: ConfidentialityLevel;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

export interface HolidayRecord {
  _rowIndex?: number;
  holiday_id: string;
  exercise_id: string;
  fecha: string;
  nombre: string;
  ambito: HolidayScope;
  territorio: string;
  activo: boolean;
  fuente_validacion: string;
}

export interface LocalHolidayRecord {
  _rowIndex?: number;
  local_holiday_id: string;
  exercise_id: string;
  municipio: string;
  provincia: ProvinceCLM;
  fecha: string;
  nombre: string;
  activo: boolean;
  fuente_validacion: string;
}

export interface AuditMovement {
  _rowIndex?: number;
  movement_id: string;
  timestamp: string;
  admin_id: string;
  worker_id: string;
  province_snapshot: string;
  record_type: string;
  record_id: string;
  action: AuditAction;
  old_values: string;
  new_values: string;
  notes: string;
  hash_prev: string;
}

export interface GeneratedReportRecord {
  _rowIndex?: number;
  report_id: string;
  tipo_informe: string;
  ambito: string;
  exercise_id: string;
  fecha_corte: string;
  periodo_inicio: string;
  periodo_fin: string;
  generated_at: string;
  admin_id: string;
  formato: ReportFormat;
  drive_file_id: string;
  drive_web_url: string;
  estado: string;
}

export interface ConfigEntry {
  _rowIndex?: number;
  config_key: string;
  config_value: string;
  descripcion: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  modified_at: string;
  modified_by: string;
}

export interface ClosureRecord {
  _rowIndex?: number;
  closure_id: string;
  exercise_id: string;
  fecha_original: string;
  fecha_efectiva: string;
  motivo: ClosureReason;
  estado: ClosureStatus;
  fuente: string;
  referencia: string;
  fecha_comunicacion: string;
  admin_id: string;
  created_at: string;
  updated_at: string;
}

export type SheetTabName =
  | 'PERSONAL'
  | 'ADMINISTRADORES'
  | 'EJERCICIOS'
  | 'SALDOS'
  | 'VACACIONES'
  | 'LIBRE_DISPOSICION'
  | 'AUSENCIAS'
  | 'FESTIVOS'
  | 'FESTIVOS_LOCALES'
  | 'HISTORICO'
  | 'INFORMES_GENERADOS'
  | 'CONFIGURACION'
  | 'CIERRES';

export interface SpreadsheetDataset {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  lastSyncedAt: string;
  personal: Worker[];
  administradores: Administrator[];
  ejercicios: Exercise[];
  saldos: BalanceRecord[];
  vacaciones: VacationRecord[];
  libreDisposicion: LibreDisposicionRecord[];
  ausencias: AbsenceRecord[];
  festivos: HolidayRecord[];
  festivosLocales: LocalHolidayRecord[];
  historico: AuditMovement[];
  informesGenerados: GeneratedReportRecord[];
  configuracion: ConfigEntry[];
  cierres: ClosureRecord[];
  rawTabs: Record<SheetTabName, string[][]>;
}

export interface PendingMutation {
  title: string;
  description: string;
  affectedTarget: string;
  affectedCountLabel?: string;
  variant?: 'standard' | 'danger' | 'warning';
  execute: () => Promise<void>;
}
