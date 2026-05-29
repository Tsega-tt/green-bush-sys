import React, { useCallback, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ *
 * Reusable inventory UI kit — large, readable, tablet-friendly, fast.
 * Keep every inventory page consistent with these primitives.
 * ------------------------------------------------------------------ */

export const fmtMoney = (v) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (v) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
export const fmtDate = (v) => (v ? new Date(v).toLocaleString() : '-');
export const fmtDay = (v) => (v ? new Date(v).toLocaleDateString() : '-');

const STATUS_COLORS = {
  open: 'bg-amber-100 text-amber-800', draft: 'bg-gray-100 text-gray-700',
  pending_fnb: 'bg-amber-100 text-amber-800', pending_owner: 'bg-orange-100 text-orange-800',
  issued: 'bg-blue-100 text-blue-800', approved: 'bg-green-100 text-green-800',
  partially_approved: 'bg-blue-100 text-blue-800', partially_received: 'bg-blue-100 text-blue-800',
  sent: 'bg-purple-100 text-purple-800', received: 'bg-green-100 text-green-800',
  posted: 'bg-green-100 text-green-800', confirmed: 'bg-green-100 text-green-800',
  finalized: 'bg-green-100 text-green-800', closed: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-100 text-red-700', cancelled: 'bg-red-100 text-red-700',
  empty: 'bg-gray-200 text-gray-600', tapped: 'bg-purple-100 text-purple-800',
  critical: 'bg-red-100 text-red-700', warning: 'bg-amber-100 text-amber-800', info: 'bg-blue-100 text-blue-800',
};

export function StatusBadge({ value }) {
  const c = STATUS_COLORS[value] || 'bg-gray-100 text-gray-700';
  return <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${c}`}>{String(value || '').replace(/_/g, ' ')}</span>;
}

/** Page header with title + right-aligned controls. */
export function PageHeader({ title, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <h1 className="text-xl md:text-2xl font-bold mr-auto">{title}</h1>
      {children}
    </div>
  );
}

export function Btn({ children, variant = 'default', className = '', ...rest }) {
  const styles = {
    default: 'bg-gray-100 hover:bg-gray-200 text-gray-800',
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warn: 'bg-amber-500 hover:bg-amber-600 text-white',
  };
  return (
    <button {...rest} className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function TextInput({ label, className = '', ...rest }) {
  return (
    <label className="block text-sm">
      {label && <span className="block text-gray-600 mb-1">{label}</span>}
      <input {...rest} className={`w-full border rounded-lg px-3 py-2 ${className}`} />
    </label>
  );
}

export function Select({ label, children, className = '', ...rest }) {
  return (
    <label className="block text-sm">
      {label && <span className="block text-gray-600 mb-1">{label}</span>}
      <select {...rest} className={`w-full border rounded-lg px-3 py-2 ${className}`}>{children}</select>
    </label>
  );
}

/** Large, scannable data table with loading / empty / error states. */
export function DataTable({ columns, rows, loading, error, empty = 'No records', keyField = 'id', onRetry }) {
  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {loading && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
          {!loading && error && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-red-500">
              Failed to load. {onRetry && <button onClick={onRetry} className="underline">Retry</button>}
            </td></tr>
          )}
          {!loading && !error && rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">{empty}</td></tr>
          )}
          {!loading && !error && rows.map((row, i) => (
            <tr key={row[keyField] ?? i} className="hover:bg-gray-50">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Modal shell. Used sparingly (create/edit forms only). */
export function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onMouseDown={onClose}>
      <div className={`bg-white rounded-xl p-5 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-4"><h2 className="font-bold text-lg mr-auto">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value, accent, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-xl shadow p-5 ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent || ''}`}>{value}</div>
    </div>
  );
}

/* ------------------------------ hooks ------------------------------ */

/** Generic data loader with loading/error/refetch. `loader` returns a value. */
export function useApiResource(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refetch = useCallback(() => {
    setLoading(true); setError(null);
    return Promise.resolve(loaderRef.current())
      .then((d) => setData(d))
      .catch((e) => setError(e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refetch(); }, [refetch]);
  return { data, loading, error, refetch, setData };
}

/** Guards against duplicate submissions: [busy, run]. */
export function useSubmitGuard() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn) => {
    if (busy) return undefined;
    setBusy(true);
    try { return await fn(); } finally { setBusy(false); }
  }, [busy]);
  return [busy, run];
}
