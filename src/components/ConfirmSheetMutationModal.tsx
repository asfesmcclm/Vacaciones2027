import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { PendingMutation } from '../types/sheets';

interface ConfirmSheetMutationModalProps {
  mutation: PendingMutation | null;
  onCancel: () => void;
  onCompleted: () => void;
}

export const ConfirmSheetMutationModal: React.FC<ConfirmSheetMutationModalProps> = ({
  mutation,
  onCancel,
  onCompleted,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!mutation) return null;

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await mutation.execute();
      onCompleted();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al escribir en Google Sheets / Google Drive.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDanger = mutation.variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-mutation-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                isDanger
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {isDanger ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
            </div>
            <div>
              <h3
                id="confirm-mutation-title"
                className="text-base font-semibold text-slate-900"
              >
                {mutation.title}
              </h3>
              <p className="text-xs text-slate-500">
                Confirmación explícita de escritura en Google Workspace
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm text-slate-700">
          <p className="leading-relaxed">{mutation.description}</p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-4 py-1">
              <span className="font-medium text-slate-500">Destino afectado</span>
              <span className="font-mono font-medium text-slate-900">
                {mutation.affectedTarget}
              </span>
            </div>
            {mutation.affectedCountLabel && (
              <div className="flex items-center justify-between gap-4 border-t border-slate-200 py-1 pt-2 mt-1">
                <span className="font-medium text-slate-500">Alcance de la operación</span>
                <span className="font-mono text-slate-900">
                  {mutation.affectedCountLabel}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 border-t border-slate-200 py-1 pt-2 mt-1">
              <span className="font-medium text-slate-500">Trazabilidad</span>
              <span className="text-slate-700">
                Se añadirá movimiento inmutable en <span className="font-mono">HISTORICO</span>
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5 rounded-b-xl">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-60 whitespace-nowrap shrink-0 ${
              isDanger
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Confirmar y guardar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
