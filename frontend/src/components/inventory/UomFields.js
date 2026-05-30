import React, { useEffect, useState, useCallback } from 'react';
import inventoryApi from '../../services/inventoryApi';

/**
 * Data-driven UOM section. Given the selected `uom`, it looks up that unit's
 * attribute schema (from /api/inv/uoms) and renders the relevant fields
 * dynamically — number / text / select — with labels, units, tooltips and
 * validation. Any UOM (and any attribute) added in the DB shows up here with
 * NO code change.
 *
 * Props:
 *   uom        : selected UOM code
 *   value      : { attr_key: value } object (controlled)
 *   onChange   : (next) => void  — receives the updated attribute object
 *   uoms       : optional pre-fetched UOM list (to avoid refetching per form)
 *   onValidityChange : optional (bool) => void — true when required fields filled
 */
export default function UomFields({ uom, value = {}, onChange, uoms: provided, onValidityChange }) {
  const [uoms, setUoms] = useState(provided || []);

  useEffect(() => {
    if (provided && provided.length) { setUoms(provided); return; }
    inventoryApi.uoms.list().then((r) => setUoms(r.data.data.uoms || [])).catch(() => {});
  }, [provided]);

  const def = uoms.find((u) => u.code === uom);
  const attrs = def ? def.attributes || [] : [];

  // Report whether all required attributes are filled.
  const checkValidity = useCallback((vals) => {
    if (!onValidityChange) return;
    const ok = attrs.every((a) => !a.is_required || (vals[a.attr_key] !== undefined && vals[a.attr_key] !== '' && vals[a.attr_key] !== null));
    onValidityChange(ok);
  }, [attrs, onValidityChange]);

  useEffect(() => { checkValidity(value); }, [uom, value, checkValidity]);

  if (!uom) {
    return <p className="text-xs text-gray-400">Select a unit of measure to configure its details.</p>;
  }
  if (attrs.length === 0) {
    return <p className="text-xs text-gray-400">No extra details for <span className="font-mono">{def?.name || uom}</span> — it's a base unit.</p>;
  }

  const set = (key, v) => {
    const next = { ...value, [key]: v };
    onChange(next);
    checkValidity(next);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
      {attrs.map((a) => (
        <Field key={a.attr_key} attr={a} value={value[a.attr_key] ?? ''} onChange={(v) => set(a.attr_key, v)} />
      ))}
    </div>
  );
}

function Field({ attr, value, onChange }) {
  const label = (
    <span className="flex items-center gap-1 text-xs font-semibold text-gray-600 mb-1">
      {attr.label}
      {attr.unit && <span className="text-gray-400 font-normal">({attr.unit})</span>}
      {attr.is_required && <span className="text-red-500">*</span>}
      {attr.help_text && (
        <span className="relative group cursor-help">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold">?</span>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block z-10 w-48 bg-gray-800 text-white text-[11px] rounded-md px-2 py-1 shadow-lg">
            {attr.help_text}
          </span>
        </span>
      )}
    </span>
  );

  const cls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400';

  return (
    <label className="block">
      {label}
      {attr.input_type === 'select' ? (
        <select className={cls} value={value} onChange={(e) => onChange(e.target.value)} required={attr.is_required}>
          <option value="">Select…</option>
          {(attr.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : attr.input_type === 'text' ? (
        <input className={cls} type="text" value={value} onChange={(e) => onChange(e.target.value)} required={attr.is_required} placeholder={attr.label} />
      ) : (
        <input className={cls} type="number" step="0.001" min="0" value={value} onChange={(e) => onChange(e.target.value)} required={attr.is_required} placeholder={attr.unit || '0'} />
      )}
    </label>
  );
}
