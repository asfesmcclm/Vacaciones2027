import React, { useState } from 'react';
import { Plus, Shield, UserCheck } from 'lucide-react';
import {
  Administrator,
  AdminRole,
  AdminStatus,
  PendingMutation,
  SpreadsheetDataset,
} from '../types/sheets';
import { appendAuditMovement, appendTabRows, updateTabRow } from '../services/sheetsApi';

interface SettingsViewProps {
  dataset: SpreadsheetDataset;
  currentAdmin: Administrator | null;
  accessToken: string;
  onRequestMutation: (mutation: PendingMutation) => void;
}

const PENDING_DECISIONS = [
  {
    asunto: 'Municipio de referencia de cada trabajador/a',
    estado: 'Pendiente de facilitar (editable en ficha personal)',
  },
  {
    asunto: 'Dos festivos locales por trabajador y ejercicio',
    estado: 'Pendiente de municipios y calendario oficial',
  },
  {
    asunto: 'Imputación de vacaciones que cruzan ejercicios (dic → ene)',
    estado: 'Propuesta por defecto ap. 3.4: imputar cada día al ejercicio de su fecha',
  },
  {
    asunto: 'Permisos diferenciados entre administradores',
    estado: 'Soporte configurable por rol y permiso de ausencias sensibles',
  },
  {
    asunto: 'Validación oficial calendario 2027 (Decreto 34/2026 DOCM 13/07/2026)',
    estado: 'Pendiente de contraste final en pestaña Calendarios',
  },
  {
    asunto: 'Arrastre de saldos al cerrar el ejercicio',
    estado: 'Pendiente de definir (caducidad, traslado o plazo)',
  },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  dataset,
  currentAdmin,
  accessToken,
  onRequestMutation,
}) => {
  const adminId = currentAdmin?.admin_id || 'ADM-001';
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [admName, setAdmName] = useState('');
  const [admEmail, setAdmEmail] = useState('');
  const [admRole, setAdmRole] = useState<AdminRole>('ADMIN_GESTION');
  const [admCanViewSensitive, setAdmCanViewSensitive] = useState(false);

  const handleAddAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!admEmail.trim() || !admName.trim()) return;
    const nowIso = new Date().toISOString();
    const newId = `ADM-${String(dataset.administradores.length + 1).padStart(3, '0')}`;

    onRequestMutation({
      title: `Autorizar nuevo administrador (${admEmail.trim()})`,
      description: `Se añadirá a ${admName.trim()} (${admEmail.trim()}) con rol ${admRole} en la pestaña ADMINISTRADORES.`,
      affectedTarget: 'ADMINISTRADORES',
      execute: async () => {
        await appendTabRows(accessToken, dataset.spreadsheetId, 'ADMINISTRADORES', [
          [
            newId,
            admName.trim(),
            admEmail.trim().toLowerCase(),
            admRole,
            admCanViewSensitive ? 'TRUE' : 'FALSE',
            'activo',
            nowIso,
            '',
          ],
        ]);
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'SISTEMA',
          provinceSnapshot: 'CLM',
          recordType: 'ADMINISTRADORES',
          recordId: newId,
          action: 'alta',
          oldValues: null,
          newValues: {
            admin_id: newId,
            email: admEmail.trim().toLowerCase(),
            rol: admRole,
            puede_ver_ausencias_sensibles: admCanViewSensitive,
          },
          notes: `Alta administrador autorizado: ${admEmail.trim()}`,
        });
      },
    });
    setShowAddAdmin(false);
    setAdmName('');
    setAdmEmail('');
  };

  const handleToggleAdminStatus = (a: Administrator) => {
    if (!a._rowIndex) return;
    const nextStatus: AdminStatus = a.estado === 'activo' ? 'inactivo' : 'activo';
    const nowDate = nextStatus === 'inactivo' ? new Date().toISOString().slice(0, 10) : '';
    onRequestMutation({
      title: `${nextStatus === 'activo' ? 'Reactivar' : 'Desactivar'} administrador ${a.nombre_visible}`,
      description: `Se cambiará el estado de ${a.email} a "${nextStatus}" en la pestaña ADMINISTRADORES.`,
      affectedTarget: `ADMINISTRADORES (fila ${a._rowIndex})`,
      variant: nextStatus === 'inactivo' ? 'danger' : 'standard',
      execute: async () => {
        await updateTabRow(
          accessToken,
          dataset.spreadsheetId,
          'ADMINISTRADORES',
          a._rowIndex!,
          [
            a.admin_id,
            a.nombre_visible,
            a.email,
            a.rol,
            a.puede_ver_ausencias_sensibles ? 'TRUE' : 'FALSE',
            nextStatus,
            a.fecha_alta,
            nowDate,
          ]
        );
        await appendAuditMovement(accessToken, dataset.spreadsheetId, dataset.historico, {
          adminId,
          workerId: 'SISTEMA',
          provinceSnapshot: 'CLM',
          recordType: 'ADMINISTRADORES',
          recordId: a.admin_id,
          action: 'modificacion',
          oldValues: { estado: a.estado },
          newValues: { estado: nextStatus },
          notes: `Cambio de estado de administrador ${a.email}: ${nextStatus}`,
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Admins section */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-red-700" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Administradores autorizados (ADMINISTRADORES)
              </h2>
              <p className="text-xs text-slate-500">
                Cuentas individuales con trazabilidad. No se almacenan contraseñas en Google Sheets.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowAddAdmin(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-800"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Añadir administrador</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-4 py-3 font-semibold">ID</th>
                <th className="px-4 py-3 font-semibold">Nombre visible</th>
                <th className="px-4 py-3 font-semibold">Email Google</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Ver ausencias RGPD</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dataset.administradores.map((a) => (
                <tr key={a.admin_id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono">{a.admin_id}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{a.nombre_visible}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{a.email}</td>
                  <td className="px-4 py-3 font-mono">{a.rol}</td>
                  <td className="px-4 py-3">
                    {a.puede_ver_ausencias_sensibles ? 'Autorizado' : 'Restringido'}
                  </td>
                  <td className="px-4 py-3 capitalize">{a.estado}</td>
                  <td className="px-4 py-3 text-right">
                    {a.email.toLowerCase() !== currentAdmin?.email.toLowerCase() && (
                      <button
                        type="button"
                        onClick={() => handleToggleAdminStatus(a)}
                        className="font-medium text-red-700 hover:underline"
                      >
                        {a.estado === 'activo' ? 'Desactivar' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Configuration & Pending Decisions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Parámetros activos (CONFIGURACION)
            </h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {dataset.configuracion.map((c) => (
              <div key={c.config_key} className="px-6 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-slate-900">
                    {c.config_key}
                  </span>
                  <span className="font-mono text-red-700">{c.config_value}</span>
                </div>
                <p className="mt-1 text-slate-500">{c.descripcion}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 px-6 py-4">
            <UserCheck className="h-4 w-4 text-amber-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Reglas pendientes de validación (ap. 16)
            </h3>
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            {PENDING_DECISIONS.map((pd) => (
              <div key={pd.asunto} className="px-6 py-3">
                <p className="font-medium text-slate-900">{pd.asunto}</p>
                <p className="mt-0.5 text-amber-800">{pd.estado}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {showAddAdmin && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleAddAdmin}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900">
                Autorizar administrador
              </h3>
            </div>
            <div className="space-y-4 px-6 py-5 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Nombre visible *
                </label>
                <input
                  type="text"
                  required
                  value={admName}
                  onChange={(e) => setAdmName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Cuenta de Google (email) *
                </label>
                <input
                  type="email"
                  required
                  value={admEmail}
                  onChange={(e) => setAdmEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-slate-900"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Rol</label>
                <select
                  value={admRole}
                  onChange={(e) => setAdmRole(e.target.value as AdminRole)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                >
                  <option value="ADMIN_SUPER">ADMIN_SUPER (Acceso total)</option>
                  <option value="ADMIN_GESTION">ADMIN_GESTION (Operación estándar)</option>
                  <option value="ADMIN_CONSULTA">ADMIN_CONSULTA (Solo consulta e informes)</option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={admCanViewSensitive}
                  onChange={(e) => setAdmCanViewSensitive(e.target.checked)}
                />
                <span>Autorizar consulta de ausencias protegidas (Art. 9 RGPD)</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
              <button
                type="button"
                onClick={() => setShowAddAdmin(false)}
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
    </div>
  );
};
