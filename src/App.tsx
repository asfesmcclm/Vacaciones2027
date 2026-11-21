import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  CalendarDays,
  CalendarRange,
  ExternalLink,
  FileBarChart2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import {
  clearAccessToken,
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from './services/googleAuth';
import {
  connectAndVerifySpreadsheet,
  createStructuredSpreadsheet,
  loadAllTabs,
  SheetsApiError,
} from './services/sheetsApi';
import {
  Administrator,
  PendingMutation,
  SpreadsheetDataset,
} from './types/sheets';
import { AuthAndSetupGate } from './components/AuthAndSetupGate';
import { ConfirmSheetMutationModal } from './components/ConfirmSheetMutationModal';
import { DashboardView } from './components/DashboardView';
import { WorkersView } from './components/WorkersView';
import { VacationsView } from './components/VacationsView';
import { AbsencesView } from './components/AbsencesView';
import { CalendarsView } from './components/CalendarsView';
import { ReportsView } from './components/ReportsView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { SheetsExplorerView } from './components/SheetsExplorerView';
import { SettingsView } from './components/SettingsView';
import { formatDateTimeES } from './utils/calculations';

type NavTab =
  | 'dashboard'
  | 'personal'
  | 'vacaciones'
  | 'ausencias'
  | 'calendarios'
  | 'informes'
  | 'historico'
  | 'sheets'
  | 'configuracion';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard general', icon: LayoutDashboard },
  { id: 'personal', label: 'Personal y fichas', icon: Users },
  { id: 'vacaciones', label: 'Vacaciones y LD', icon: CalendarRange },
  { id: 'ausencias', label: 'Otras ausencias', icon: ShieldAlert },
  { id: 'calendarios', label: 'Calendarios y cierres', icon: CalendarDays },
  { id: 'informes', label: 'Informes y Drive', icon: FileBarChart2 },
  { id: 'historico', label: 'Histórico y auditoría', icon: History },
  { id: 'sheets', label: 'Tabla Google Sheets', icon: FileSpreadsheet },
  { id: 'configuracion', label: 'Configuración y admins', icon: Settings },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [dataset, setDataset] = useState<SpreadsheetDataset | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string>('EX-2027');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [reportInitialWorkerId, setReportInitialWorkerId] = useState<string | null>(null);
  const [pendingMutation, setPendingMutation] = useState<PendingMutation | null>(null);

  useEffect(() => {
    const unsub = initAuth(
      (authUser, token) => {
        setUser(authUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        setNeedsAuth(false);

        // If URL has ?sheet=ID, auto-connect idempotently
        const params = new URLSearchParams(window.location.search);
        const sheetFromUrl = params.get('sheet');
        if (sheetFromUrl) {
          await handleConnectSpreadsheet(sheetFromUrl, res.accessToken, res.user);
        }
      }
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'No se pudo completar la autenticación con Google.'
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
    setDataset(null);
    setNeedsAuth(true);
  };

  const handleCreateSpreadsheet = async () => {
    const token = getAccessToken() || accessToken;
    if (!token || !user) {
      setNeedsAuth(true);
      return;
    }
    setSetupBusy(true);
    setSetupError(null);
    try {
      const created = await createStructuredSpreadsheet(
        token,
        user.email || '',
        user.displayName || user.email || 'Administrador'
      );
      setDataset(created);
      if (created.ejercicios.length > 0) {
        setSelectedExerciseId(created.ejercicios[0].exercise_id);
      }
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('sheet', created.spreadsheetId);
      window.history.replaceState({}, '', nextUrl.toString());
      setBannerMessage(
        'Hoja de Google Sheets creada automáticamente con las 13 pestañas y datos iniciales.'
      );
    } catch (err) {
      if (err instanceof SheetsApiError && err.status === 401) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSetupError(
        err instanceof Error
          ? err.message
          : 'No se pudo crear la hoja de Google Sheets.'
      );
    } finally {
      setSetupBusy(false);
    }
  };

  const handleConnectSpreadsheet = async (
    idOrUrl: string,
    tokenOverride?: string,
    userOverride?: User
  ) => {
    const token = tokenOverride || getAccessToken() || accessToken;
    const activeUser = userOverride || user;
    if (!token || !activeUser) {
      setNeedsAuth(true);
      return;
    }
    setSetupBusy(true);
    setSetupError(null);
    try {
      const { dataset: loaded, createdTabs } = await connectAndVerifySpreadsheet(
        token,
        idOrUrl,
        activeUser.email || '',
        activeUser.displayName || activeUser.email || 'Administrador'
      );
      setDataset(loaded);
      if (loaded.ejercicios.length > 0) {
        setSelectedExerciseId(loaded.ejercicios[0].exercise_id);
      }
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.set('sheet', loaded.spreadsheetId);
      window.history.replaceState({}, '', nextUrl.toString());
      if (createdTabs.length > 0) {
        setBannerMessage(
          `Estructura verificada: se crearon ${createdTabs.length} pestañas faltantes (${createdTabs.join(', ')}).`
        );
      } else {
        setBannerMessage('Hoja de Google Sheets conectada y sincronizada.');
      }
    } catch (err) {
      if (err instanceof SheetsApiError && err.status === 401) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setSetupError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar la hoja de Google Sheets.'
      );
    } finally {
      setSetupBusy(false);
    }
  };

  const refreshDataset = useCallback(async () => {
    const token = getAccessToken() || accessToken;
    if (!token || !dataset) return;
    setSyncBusy(true);
    try {
      const reloaded = await loadAllTabs(token, dataset.spreadsheetId);
      setDataset(reloaded);
    } catch (err) {
      if (err instanceof SheetsApiError && err.status === 401) {
        clearAccessToken();
        setNeedsAuth(true);
      }
      setBannerMessage(
        err instanceof Error ? err.message : 'Error al sincronizar Google Sheets.'
      );
    } finally {
      setSyncBusy(false);
    }
  }, [accessToken, dataset]);

  const handleVerifyStructure = async () => {
    if (!dataset) return;
    await handleConnectSpreadsheet(dataset.spreadsheetId);
  };

  const currentAdmin: Administrator | null = useMemo(() => {
    if (!dataset || !user?.email) return null;
    const match = dataset.administradores.find(
      (a) => a.email.toLowerCase() === user.email!.toLowerCase()
    );
    if (match) return match;
    if (dataset.administradores.length === 0) {
      return {
        admin_id: 'ADM-001',
        nombre_visible: user.displayName || user.email,
        email: user.email,
        rol: 'ADMIN_SUPER',
        puede_ver_ausencias_sensibles: true,
        estado: 'activo',
        fecha_alta: new Date().toISOString(),
        fecha_baja: '',
      };
    }
    return null;
  }, [dataset, user]);

  if (needsAuth || !accessToken || !dataset) {
    return (
      <AuthAndSetupGate
        user={user}
        hasToken={Boolean(accessToken)}
        isLoggingIn={isLoggingIn}
        authError={authError}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onCreateSpreadsheet={handleCreateSpreadsheet}
        onConnectSpreadsheet={(val) => handleConnectSpreadsheet(val)}
        setupBusy={setupBusy}
        setupError={setupError}
      />
    );
  }

  // Admin Authorization check against ADMINISTRADORES tab
  const isAuthorizedAdmin =
    currentAdmin !== null && currentAdmin.estado === 'activo';

  const currentNavLabel =
    NAV_ITEMS.find((n) => n.id === activeNav)?.label || 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="font-display text-sm font-bold text-slate-900 leading-snug">
            FeSMC UGT CLM
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Vacaciones e informes
          </p>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveNav(item.id);
                  if (item.id !== 'personal') setSelectedWorkerId(null);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-red-50 text-red-800 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-red-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4 text-xs space-y-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">
              {currentAdmin?.nombre_visible || user?.displayName || user?.email}
            </p>
            <p className="truncate font-mono text-[11px] text-slate-500">
              {currentAdmin ? `${currentAdmin.admin_id} · ${currentAdmin.rol}` : 'No autorizado'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 flex w-64 flex-col bg-white border-r border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <span className="font-display text-sm font-bold text-slate-900">
                FeSMC UGT CLM
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 p-3">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium ${
                      active ? 'bg-red-50 text-red-800 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-4 px-6 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 lg:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
                <span className="font-medium text-slate-900 whitespace-nowrap">
                  Administración
                </span>
                <span aria-hidden="true">/</span>
                <span className="font-semibold text-red-700 truncate">
                  {currentNavLabel}
                </span>
                <span className="hidden md:inline" aria-hidden="true">
                  ·
                </span>
                <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                  Sincronizado {formatDateTimeES(dataset.lastSyncedAt)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <select
                value={selectedExerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                aria-label="Seleccionar ejercicio"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-900"
              >
                {dataset.ejercicios.map((ex) => (
                  <option key={ex.exercise_id} value={ex.exercise_id}>
                    Ejercicio {ex.anio}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={refreshDataset}
                disabled={syncBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>

              <a
                href={dataset.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <span>Google Sheet</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">
          {bannerMessage && (
            <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-700">
              <span>{bannerMessage}</span>
              <button
                type="button"
                onClick={() => setBannerMessage(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!isAuthorizedAdmin ? (
            <div className="rounded-xl border border-red-200 bg-white p-8 text-center max-w-lg mx-auto mt-10">
              <h2 className="text-lg font-bold text-slate-900">
                Cuenta no autorizada en ADMINISTRADORES
              </h2>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Tu cuenta (<span className="font-mono">{user?.email}</span>) no figura como
                administrador activo en la pestaña <span className="font-mono">ADMINISTRADORES</span>{' '}
                de esta hoja de cálculo. Solicita a un administrador que dé de alta tu correo.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
              >
                Cambiar de cuenta
              </button>
            </div>
          ) : (
            <>
              {activeNav === 'dashboard' && (
                <DashboardView
                  dataset={dataset}
                  selectedExerciseId={selectedExerciseId}
                  currentAdmin={currentAdmin}
                  onSelectWorker={(wId) => {
                    setSelectedWorkerId(wId);
                    setActiveNav('personal');
                  }}
                  onNavigateTab={(tab) => setActiveNav(tab as NavTab)}
                />
              )}

              {activeNav === 'personal' && (
                <WorkersView
                  dataset={dataset}
                  selectedExerciseId={selectedExerciseId}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  selectedWorkerId={selectedWorkerId}
                  onSelectWorker={setSelectedWorkerId}
                  onRequestMutation={setPendingMutation}
                  onOpenIndividualReport={(wId) => {
                    setReportInitialWorkerId(wId);
                    setActiveNav('informes');
                  }}
                />
              )}

              {activeNav === 'vacaciones' && (
                <VacationsView
                  dataset={dataset}
                  selectedExerciseId={selectedExerciseId}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  onRequestMutation={setPendingMutation}
                />
              )}

              {activeNav === 'ausencias' && (
                <AbsencesView
                  dataset={dataset}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  onRequestMutation={setPendingMutation}
                />
              )}

              {activeNav === 'calendarios' && (
                <CalendarsView
                  dataset={dataset}
                  selectedExerciseId={selectedExerciseId}
                  onSelectExercise={setSelectedExerciseId}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  onRequestMutation={setPendingMutation}
                />
              )}

              {activeNav === 'informes' && (
                <ReportsView
                  dataset={dataset}
                  selectedExerciseId={selectedExerciseId}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  initialWorkerId={reportInitialWorkerId}
                  onRequestMutation={setPendingMutation}
                />
              )}

              {activeNav === 'historico' && (
                <AuditHistoryView dataset={dataset} />
              )}

              {activeNav === 'sheets' && (
                <SheetsExplorerView
                  dataset={dataset}
                  onRefresh={refreshDataset}
                  onVerifyStructure={handleVerifyStructure}
                  isBusy={syncBusy || setupBusy}
                />
              )}

              {activeNav === 'configuracion' && (
                <SettingsView
                  dataset={dataset}
                  currentAdmin={currentAdmin}
                  accessToken={accessToken}
                  onRequestMutation={setPendingMutation}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mandatory User Confirmation Modal for all Sheets/Drive writes */}
      <ConfirmSheetMutationModal
        mutation={pendingMutation}
        onCancel={() => setPendingMutation(null)}
        onCompleted={async () => {
          setPendingMutation(null);
          await refreshDataset();
          setBannerMessage('Operación guardada en Google Sheets y registrada en HISTORICO.');
        }}
      />
    </div>
  );
}
