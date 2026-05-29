import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import inventoryApi from '../../services/inventoryApi';
import useMasterData from '../../hooks/useMasterData';
import useInventoryEvents from '../../hooks/useInventoryEvents';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/invPermissions';
import { PageHeader, Btn, DataTable, Modal, Select, TextInput, StatusBadge, fmtNum, fmtDate, useApiResource, useSubmitGuard } from '../../components/inventory/kit';

export default function Kegs() {
  const { user } = useAuth();
  const canKegs = can(user?.role, 'kegs');
  const { stores, items, suppliers } = useMasterData({ stores: true, items: true, suppliers: true });
  const pinned = user?.store_id || null;
  const [storeId, setStoreId] = useState(pinned || '');
  const [status, setStatus] = useState('');
  const [receiving, setReceiving] = useState(false);
  const [eventKeg, setEventKeg] = useState(null);

  const { data, loading, error, refetch } = useApiResource(
    () => inventoryApi.kegs.list({ store_id: storeId || undefined, status: status || undefined }).then((r) => r.data.data.kegs || r.data.data.rows || []),
    [storeId, status]
  );
  useInventoryEvents(useCallback((t) => { if (t === 'keg.changed') refetch(); }, [refetch]));

  const columns = [
    { key: 'keg_code', label: 'Keg', render: (r) => <span className="font-mono text-xs">{r.keg_code}</span> },
    { key: 'store_name', label: 'Store' },
    { key: 'size_liters', label: 'Size', align: 'right', render: (r) => `${fmtNum(r.size_liters)} L` },
    { key: 'liters_remaining', label: 'Remaining', align: 'right', render: (r) => {
      const pct = r.size_liters ? (Number(r.liters_remaining) / Number(r.size_liters)) * 100 : 0;
      return <span className={pct < 15 ? 'text-red-600 font-semibold' : ''}>{fmtNum(r.liters_remaining)} L</span>;
    } },
    { key: 'liters_sold', label: 'Sold', align: 'right', render: (r) => fmtNum(r.liters_sold) },
    { key: 'liters_waste', label: 'Waste', align: 'right', render: (r) => fmtNum(r.liters_waste) },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
    { key: 'actions', label: '', align: 'right', render: (r) => (
      (canKegs && (r.status === 'received' || r.status === 'tapped'))
        ? <Btn onClick={() => setEventKeg(r)}>Record</Btn>
        : <span className="text-xs text-gray-400">—</span>
    ) },
  ];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Kegs">
        <Select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="!w-44">
          <option value="">All stores</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-40">
          <option value="">All statuses</option>
          {['received', 'tapped', 'empty', 'returned'].map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        {canKegs && <Btn variant="primary" onClick={() => setReceiving(true)}>Receive keg</Btn>}
      </PageHeader>
      <DataTable columns={columns} rows={data || []} loading={loading} error={error} onRetry={refetch} empty="No kegs" />

      {receiving && <ReceiveKeg stores={stores} items={items} suppliers={suppliers} pinned={pinned} onClose={() => setReceiving(false)} onDone={() => { setReceiving(false); refetch(); }} />}
      {eventKeg && <KegEventModal keg={eventKeg} onClose={() => setEventKeg(null)} onDone={() => { setEventKeg(null); refetch(); }} />}
    </div>
  );
}

function ReceiveKeg({ stores, items, suppliers, pinned, onClose, onDone }) {
  const [form, setForm] = useState({ store_id: pinned || '', keg_code: '', size_liters: '', item_id: '', supplier_id: '' });
  const [busy, run] = useSubmitGuard();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        await inventoryApi.kegs.receive({
          store_id: Number(form.store_id), keg_code: form.keg_code || undefined,
          size_liters: Number(form.size_liters),
          item_id: form.item_id ? Number(form.item_id) : undefined,
          supplier_id: form.supplier_id ? Number(form.supplier_id) : undefined,
        });
        toast.success('Keg received');
        onDone();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };
  return (
    <Modal title="Receive keg" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Select label="Store" required value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} disabled={!!pinned}>
          <option value="">Select…</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Keg code" value={form.keg_code} onChange={(e) => setForm({ ...form, keg_code: e.target.value })} placeholder="auto if blank" />
          <TextInput label="Size (L)" type="number" step="0.1" min="0" required value={form.size_liters} onChange={(e) => setForm({ ...form, size_liters: e.target.value })} />
        </div>
        <Select label="Beverage item (optional)" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
          <option value="">—</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.description}</option>)}
        </Select>
        <Select label="Supplier (optional)" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
          <option value="">—</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Receive'}</Btn>
        </div>
      </form>
    </Modal>
  );
}

function KegEventModal({ keg, onClose, onDone }) {
  const tapped = keg.status === 'tapped';
  const [evType, setEvType] = useState(tapped ? 'sale' : 'tap');
  const [liters, setLiters] = useState('');
  const [note, setNote] = useState('');
  const [busy, run] = useSubmitGuard();
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        await inventoryApi.kegs.event(keg.id, {
          event_type: evType,
          liters: evType === 'tap' ? undefined : Number(liters),
          note: note || undefined,
        });
        toast.success('Recorded');
        onDone();
      } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    });
  };
  return (
    <Modal title={`Keg ${keg.keg_code} — ${fmtNum(keg.liters_remaining)} L left`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="text-sm text-gray-500">Received {fmtDate(keg.received_at)} · {fmtNum(keg.size_liters)} L</div>
        <Select label="Event" value={evType} onChange={(e) => setEvType(e.target.value)}>
          {!tapped && <option value="tap">Tap keg</option>}
          {tapped && <option value="sale">Sale / pour</option>}
          {tapped && <option value="waste">Waste / spillage</option>}
        </Select>
        {evType !== 'tap' && (
          <TextInput label="Litres" type="number" step="0.01" min="0" required value={liters} onChange={(e) => setLiters(e.target.value)} />
        )}
        <TextInput label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Record'}</Btn>
        </div>
      </form>
    </Modal>
  );
}
