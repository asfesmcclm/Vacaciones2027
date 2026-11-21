import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FolderPlus,
  Link2,
  Loader2,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { SHEET_TABS } from '../services/sheetSchema';

interface AuthAndSetupGateProps {
  user: User | null;
  hasToken: boolean;
  isLoggingIn: boolean;
  authError: string | null;
  onLogin: () => void;
  onLogout: () => void;
  onCreateSpreadsheet: () => Promise<void>;
  onConnectSpreadsheet: (idOrUrl: string) => Promise<void>;
  setupBusy: boolean;
  setupError: string | null;
}

export const AuthAndSetupGate: React.FC<AuthAndSetupGateProps> = ({
  user,
  hasToken,
  isLoggingIn,
  authError,
  onLogin,
  onLogout,
  onCreateSpreadsheet,
  onConnectSpreadsheet,
  setupBusy,
  setupError,
}) => {
  const [sheetInput, setSheetInput] = useState('');

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetInput.trim()) return;
    await onConnectSpreadsheet(sheetInput.trim());
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            FeSMC UGT Castilla-La Mancha
          </span>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Administración privada</span>
            <span aria-hidden="true">·</span>
            <span>Google Sheets y Google Drive</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12">
        <div className="grid w-full gap-10 lg:grid-cols-12 lg:items-start">
          {/* Left column: System context */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <p className="text-xs font-medium text-red-700 mb-2">
                Ficha técnica v2.3 · Control centralizado de plantilla
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 text-balance leading-tight">
                Sistema de gestión de vacaciones, ausencias e informes
              </h1>
              <p className="mt-3 text-base text-slate-600 leading-relaxed max-w-2xl">
                Plataforma privada de administración para las cinco provincias de Castilla-La Mancha.
                Los datos residen exclusivamente en tu hoja de cálculo de Google Sheets y los informes
                emitidos se archivan en Google Drive con trazabilidad completa.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Estructura automática de 13 pestañas en Google Sheets
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {SHEET_TABS.map((tab) => (
                  <div
                    key={tab.name}
                    className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1.5"
                  >
                    <span className="font-mono font-medium text-slate-800">{tab.name}</span>
                    <span className="text-slate-500 truncate">{tab.headers.length} campos</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>8 trabajadores iniciales</span>
                <span aria-hidden="true">·</span>
                <span>Calendario CLM 2027</span>
                <span aria-hidden="true">·</span>
                <span>Cierres 24 y 31 dic</span>
                <span aria-hidden="true">·</span>
                <span>Histórico con hash encadenado</span>
              </div>
            </div>
          </div>

          {/* Right column: Sign in or Sheet setup */}
          <div className="lg:col-span-5">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              {!user || !hasToken ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Acceso de administración
                      </h2>
                      <p className="text-xs text-slate-500">
                        Identificación individual con cuenta de Google
                      </p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    Inicia sesión con tu cuenta autorizada para crear o conectar la hoja de cálculo
                    de Google Sheets y archivar informes en Google Drive.
                  </p>

                  {authError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                      {authError}
                    </div>
                  )}

                  <div className="pt-1">
                    <GoogleSignInButton
                      onClick={onLogin}
                      disabled={isLoggingIn}
                      label={
                        isLoggingIn ? 'Verificando acceso...' : 'Iniciar sesión con Google'
                      }
                    />
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-4">
                    Cada operación de escritura solicita confirmación explícita y queda registrada
                    con tu identidad en la pestaña <span className="font-mono">HISTORICO</span>.
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Sesión verificada</span>
                      </div>
                      <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                        {user.displayName || user.email}
                      </p>
                      <p className="truncate text-xs text-slate-500 font-mono">{user.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={onLogout}
                      disabled={setupBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 whitespace-nowrap shrink-0"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Salir</span>
                    </button>
                  </div>

                  {setupError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
                      {setupError}
                    </div>
                  )}

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      1. Crear hoja nueva automáticamente
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Genera un nuevo archivo de Google Sheets en tu cuenta con las 13 pestañas
                      formateadas, los 8 trabajadores iniciales, los saldos 2027, los 12 festivos
                      de referencia y los cierres del 24 y 31 de diciembre.
                    </p>
                    <button
                      type="button"
                      onClick={onCreateSpreadsheet}
                      disabled={setupBusy}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 transition-colors disabled:opacity-60"
                    >
                      {setupBusy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Inicializando estructura en Google Sheets...</span>
                        </>
                      ) : (
                        <>
                          <FolderPlus className="h-4 w-4" />
                          <span>Crear Google Sheet con 13 pestañas</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-slate-400">o bien</span>
                    </div>
                  </div>

                  <form onSubmit={handleConnectSubmit} className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900">
                      2. Conectar una hoja existente
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Pega la URL o el ID del documento. La comprobación es idempotente: solo añade
                      pestañas faltantes sin duplicar ni borrar registros existentes.
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <FileSpreadsheet className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                          type="text"
                          value={sheetInput}
                          onChange={(e) => setSheetInput(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-700 focus:outline-none"
                          disabled={setupBusy}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={setupBusy || !sheetInput.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        <span>Conectar</span>
                      </button>
                    </div>
                  </form>

                  <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Database className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      Acceso directo mediante API oficial sin exponer la hoja de cálculo como pública.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
