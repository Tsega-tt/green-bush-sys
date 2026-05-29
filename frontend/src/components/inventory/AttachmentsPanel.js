import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import { Btn, fmtDate, useSubmitGuard } from './kit';

/**
 * Permanent document panel reused by PR / PO / GRN / waste / stock-count.
 * Lists, uploads (with a doc label), downloads and soft-deletes attachments.
 */
export default function AttachmentsPanel({ entityType, entityId, labels = ['invoice', 'grn', 'delivery_note', 'other'] }) {
  const [rows, setRows] = useState([]);
  const [file, setFile] = useState(null);
  const [docLabel, setDocLabel] = useState(labels[0]);
  const [busy, run] = useSubmitGuard();

  const load = () => {
    if (!entityId) return;
    inventoryApi.attachments.list(entityType, entityId)
      .then((r) => setRows(r.data.data.attachments || [])).catch(() => {});
  };
  useEffect(load, [entityType, entityId]);

  const upload = (e) => {
    e.preventDefault();
    if (!file) { toast.error('Choose a file'); return; }
    run(async () => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', entityType);
      fd.append('entity_id', entityId);
      fd.append('doc_label', docLabel);
      try {
        await inventoryApi.attachments.upload(fd);
        toast.success('Uploaded');
        setFile(null);
        load();
      } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
    });
  };

  const remove = (id) => run(async () => {
    try { await inventoryApi.attachments.remove(id); toast.success('Removed'); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  });

  return (
    <div className="border rounded-lg p-3">
      <div className="font-semibold text-sm mb-2">Documents</div>
      <form onSubmit={upload} className="flex flex-wrap items-center gap-2 mb-3">
        <select className="border rounded-lg px-2 py-1.5 text-sm" value={docLabel} onChange={(e) => setDocLabel(e.target.value)}>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <input type="file" className="text-sm" onChange={(e) => setFile(e.target.files[0] || null)} />
        <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</Btn>
      </form>
      <ul className="space-y-1 text-sm">
        {rows.length === 0 && <li className="text-gray-400">No documents</li>}
        {rows.map((a) => (
          <li key={a.id} className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">{a.doc_label || 'file'}</span>
            <a className="text-blue-600 hover:underline truncate flex-1" href={inventoryApi.attachments.downloadUrl(a.id)} target="_blank" rel="noreferrer">{a.original_name}</a>
            <span className="text-xs text-gray-400">v{a.version} · {fmtDate(a.uploaded_at)}</span>
            <button onClick={() => remove(a.id)} className="text-red-500 text-xs">remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
