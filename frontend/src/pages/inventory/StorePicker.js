import React from 'react';

/** Shared store selector. Store managers are pinned to their own store. */
export default function StorePicker({ stores, value, onChange, pinnedStoreId }) {
  if (pinnedStoreId) {
    const s = stores.find((x) => Number(x.id) === Number(pinnedStoreId));
    return <span className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium">{s ? s.name : `Store ${pinnedStoreId}`}</span>;
  }
  return (
    <select
      className="px-3 py-2 border rounded-lg text-sm"
      value={value || ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">Select store…</option>
      {stores.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}
