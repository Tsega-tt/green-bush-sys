import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Btn, Select, StatCard, StatusBadge, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

const TYPES = ['', 'low_stock', 'out_of_stock', 'expiry', 'price_spike', 'large_variance', 'keg_variance', 'missing_document', 'excessive_waste', 'unusual_purchase'];

export default function Alerts() {
  const { user } = useAuth();
  const canScan = ['admin', 'owner', 'fnb_manager'].includes(user?.role);
  const [status, setStatus] = useState('open');
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [busy, run] = useSubmitGuard();

  // Backend filters by status + type; severity is filtered client-side below.
  const { data: alerts, loading, error, refetch } = useApiResource(
    () => inventoryApi.alerts.list({ status: status || undefined, type: type || undefined })
      .then((r) => r.data.data.alerts || []),
    [status, type]
  );
  useInventoryEvents(useCallback((t) => { if (t === 'alert.new') refetch(); }, [refetch]));

  const act = (id, kind) => run(async () => {
    try {
      await (kind === 'ack' ? inventoryApi.alerts.ack(id) : inventoryApi.alerts.resolve(id));
      toast.success(kind === 'ack' ? 'Acknowledged' : 'Resolved');
      refetch();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  });

  const scan = () => run(async () => {
    try {
      const r = await inventoryApi.fraudScan();
      const n = r.data.data?.created ?? r.data.data?.alerts?.length ?? 0;
      toast.success(`Fraud scan complete — ${n} new alert(s)`);
      refetch();
    } catch (e) { toast.error(e.response?.data?.message || 'Scan failed'); }
  });

  const all = alerts || [];
  const counts = {
    critical: all.filter((a) => a.severity === 'critical').length,
    warning: all.filter((a) => a.severity === 'warning').length,
    info: all.filter((a) => a.severity === 'info').length,
  };
  const list = severity ? all.filter((a) => a.severity === severity) : all;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Alerts & Investigation">
        {canScan && <Btn variant="warn" onClick={scan} disabled={busy}>{busy ? 'Scanning…' : 'Run fraud scan'}</Btn>}
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard label="Critical" value={counts.critical} accent={counts.critical ? 'text-red-600' : ''} onClick={() => setSeverity((s) => (s === 'critical' ? '' : 'critical'))} />
        <StatCard label="Warning" value={counts.warning} accent={counts.warning ? 'text-amber-600' : ''} onClick={() => setSeverity((s) => (s === 'warning' ? '' : 'warning'))} />
        <StatCard label="Info" value={counts.info} onClick={() => setSeverity((s) => (s === 'info' ? '' : 'info'))} />
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-44">
          {['open', 'acknowledged', 'resolved', ''].map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}
        </Select>
        <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="!w-40">
          {['', 'critical', 'warning', 'info'].map((s) => <option key={s} value={s}>{s ? s : 'All severities'}</option>)}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="!w-52">
          {TYPES.map((t) => <option key={t} value={t}>{t ? t.replace(/_/g, ' ') : 'All types'}</option>)}
        </Select>
        <Btn onClick={refetch}>Refresh</Btn>
      </div>

      <div className="space-y-2">
        {loading && <div className="text-gray-400 text-center py-10">Loading…</div>}
        {error && <div className="text-red-500 text-center py-10">Failed to load. <button onClick={refetch} className="underline">Retry</button></div>}
        {!loading && !error && list.length === 0 && <div className="text-gray-400 text-center py-10">No alerts</div>}
        {list.map((a) => (
          <div key={a.id} className="bg-white rounded-xl shadow">
            <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(expanded === a.id ? null : a.id)}>
              <StatusBadge value={a.severity} />
              <div className="flex-1">
                <div className="font-medium">{a.message}</div>
                <div className="text-xs text-gray-400">{a.alert_type?.replace(/_/g, ' ')} · {a.store_name || 'all stores'} · {fmtDate(a.created_at)}</div>
              </div>
              <StatusBadge value={a.status} />
              {a.status === 'open' && <Btn onClick={(e) => { e.stopPropagation(); act(a.id, 'ack'); }} disabled={busy}>Ack</Btn>}
              {a.status !== 'resolved' && <Btn variant="success" onClick={(e) => { e.stopPropagation(); act(a.id, 'resolve'); }} disabled={busy}>Resolve</Btn>}
            </div>
            {expanded === a.id && (
              <div className="border-t px-4 py-3 text-sm bg-gray-50">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-gray-500">Entity:</span> {a.entity_type || '-'} {a.entity_id ? `#${a.entity_id}` : ''}</div>
                  <div><span className="text-gray-500">Dedup key:</span> {a.dedup_key || '-'}</div>
                </div>
                {a.details && <pre className="mt-2 bg-white border rounded-lg p-2 overflow-x-auto text-xs">{typeof a.details === 'string' ? a.details : JSON.stringify(a.details, null, 2)}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
