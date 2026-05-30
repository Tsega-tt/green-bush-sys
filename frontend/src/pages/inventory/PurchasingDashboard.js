import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import inventoryApi from '../../services/inventoryApi';
import useInventoryEvents from '../../hooks/useInventoryEvents';
import { useAuth } from '../../context/AuthContext';
import { fetchLegacyApprovedPRs } from '../../utils/legacyPrBridge';
import { PageHeader, StatCard, DataTable, StatusBadge, Btn, fmtMoney, fmtDate, useApiResource } from '../../components/inventory/kit';

const base = '/dashboard/inventory-pg';

export default function PurchasingDashboard() {
  const nav = useNavigate();
  const { user } = useAuth();
  const pr = useApiResource(() => inventoryApi.pr.list({ status: 'pending_fnb' }).then((r) => r.data.data.requisitions || []), []);
  const prOwner = useApiResource(() => inventoryApi.pr.list({ status: 'pending_owner' }).then((r) => r.data.data.requisitions || []), []);
  // Approved PRs awaiting the purchaser to raise a PO (PG approved/partially_approved
  // plus bridged legacy approved requests).
  const prReady = useApiResource(() => Promise.all([
    inventoryApi.pr.list({ status: 'approved' }),
    inventoryApi.pr.list({ status: 'partially_approved' }),
    fetchLegacyApprovedPRs(user),
  ]).then(([a, b, legacy]) => [...(a.data.data.requisitions || []), ...(b.data.data.requisitions || []), ...legacy]), [user]);
  const po = useApiResource(() => inventoryApi.po.list({ status: 'issued' }).then((r) => r.data.data.orders || []), []);
  const grn = useApiResource(() => inventoryApi.grn.list({ status: 'draft' }).then((r) => r.data.data.receipts || []), []);

  const refetchAll = useCallback(() => { pr.refetch(); prOwner.refetch(); prReady.refetch(); po.refetch(); grn.refetch(); }, [pr, prOwner, prReady, po, grn]);
  useInventoryEvents(useCallback((t) => { if (['pr.changed', 'po.changed', 'grn.changed'].includes(t)) refetchAll(); }, [refetchAll]));

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Purchasing">
        <Btn variant="primary" onClick={() => nav(`${base}/purchase-requests`)}>New request</Btn>
        <Btn onClick={() => nav(`${base}/purchase-orders`)}>Orders</Btn>
        <Btn onClick={() => nav(`${base}/goods-receipts`)}>Receive goods</Btn>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-6">
        <StatCard label="PRs awaiting F&B" value={(pr.data || []).length} accent={(pr.data || []).length ? 'text-amber-600' : ''} onClick={() => nav(`${base}/approvals`)} />
        <StatCard label="PRs awaiting owner" value={(prOwner.data || []).length} accent={(prOwner.data || []).length ? 'text-orange-600' : ''} onClick={() => nav(`${base}/approvals`)} />
        <StatCard label="Approved — ready to order" value={(prReady.data || []).length} accent={(prReady.data || []).length ? 'text-green-600' : ''} onClick={() => nav(`${base}/purchase-orders`)} />
        <StatCard label="Open orders" value={(po.data || []).length} onClick={() => nav(`${base}/purchase-orders`)} />
        <StatCard label="Receipts to post" value={(grn.data || []).length} accent={(grn.data || []).length ? 'text-blue-600' : ''} onClick={() => nav(`${base}/goods-receipts`)} />
      </div>

      {/* Approved PRs the purchaser must now turn into Purchase Orders */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Approved requests — ready for Purchase Order</h2>
          <Btn variant="primary" onClick={() => nav(`${base}/purchase-orders`)}>Create order</Btn>
        </div>
        <DataTable
          keyField="id"
          columns={[
            { key: 'pr_number', label: 'PR', render: (r) => <span className="font-mono text-xs">{r.pr_number}</span> },
            { key: 'store_name', label: 'Store' },
            { key: 'estimated_total', label: 'Est.', align: 'right', render: (r) => fmtMoney(r.estimated_total) },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'actions', label: '', align: 'right', render: () => <Btn onClick={() => nav(`${base}/purchase-orders`)}>Order →</Btn> },
          ]}
          rows={prReady.data || []} loading={prReady.loading} error={prReady.error} onRetry={refetchAll}
          empty="No approved requests waiting — they appear here once F&B (and owner, if required) approve."
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold mb-2">Requests awaiting approval</h2>
          <DataTable
            keyField="id"
            columns={[
              { key: 'pr_number', label: 'PR', render: (r) => <span className="font-mono text-xs">{r.pr_number}</span> },
              { key: 'store_name', label: 'Store' },
              { key: 'estimated_total', label: 'Est.', align: 'right', render: (r) => fmtMoney(r.estimated_total) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            ]}
            rows={[...(pr.data || []), ...(prOwner.data || [])]} loading={pr.loading} error={pr.error} onRetry={refetchAll} empty="Nothing awaiting approval"
          />
        </div>
        <div>
          <h2 className="font-semibold mb-2">Receipts to post</h2>
          <DataTable
            keyField="id"
            columns={[
              { key: 'grn_number', label: 'GRN', render: (r) => <span className="font-mono text-xs">{r.grn_number}</span> },
              { key: 'po_number', label: 'PO' },
              { key: 'store_name', label: 'Store' },
              { key: 'created_at', label: 'Drafted', render: (r) => fmtDate(r.created_at) },
            ]}
            rows={grn.data || []} loading={grn.loading} error={grn.error} onRetry={refetchAll} empty="No draft receipts"
          />
        </div>
      </div>
    </div>
  );
}
