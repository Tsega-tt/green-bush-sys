/**
 * Bridge: the standalone "Purchase Requisitions" page stores PRs in a legacy
 * JSON store (/api/purchase-requisitions), while the purchaser works in the PG
 * inventory module (/api/inv/*). This normalizes a legacy PR into the shape the
 * PG purchasing screens expect, so approved legacy PRs show up for the purchaser
 * and can be turned into Purchase Orders.
 */
import inventoryApi from '../services/inventoryApi';

// Legacy status -> PG pr_status used by the purchasing screens.
const STATUS_MAP = {
  pending_fnb: 'pending_fnb',
  approved: 'approved',
  adjusted_approved: 'partially_approved',
  rejected: 'rejected',
};

export function normalizeLegacyPR(r) {
  const qty = Number(r.approved_quantity != null ? r.approved_quantity : r.quantity) || 0;
  const unitCost = Number(r.unit_cost) || 0;
  return {
    // Prefix the id so it never collides with a PG PR id in merged lists.
    id: `legacy:${r.id}`,
    is_legacy: true,
    legacy_id: r.id,
    pr_number: r.req_number,
    store_id: r.store_id,
    store_name: r.store_name || (r.store_id ? `Store ${r.store_id}` : '—'),
    purchaser_id: r.purchaser_id,
    created_at: r.created_at,
    estimated_total: r.estimated_cost != null ? Number(r.estimated_cost) : qty * unitCost,
    status: STATUS_MAP[r.status] || r.status,
    rejection_reason: r.rejection_note || null,
    threshold_band: null,
    lines: [{
      id: r.id,
      item_id: r.item_id || null,
      description: r.item_name,
      uom: r.uom || '',
      quantity_requested: Number(r.quantity) || 0,
      quantity_approved: r.approved_quantity != null ? Number(r.approved_quantity) : null,
      est_unit_cost: unitCost,
    }],
  };
}

/**
 * Fetch legacy PRs (optionally scoped to the signed-in user) and normalize them.
 * Pass the auth user so purchasers only see PRs assigned to them.
 */
export async function fetchLegacyPRs({ status, user } = {}) {
  const params = {};
  if (status) params.status = status;
  if (user?.id) params.user_id = user.id;
  if (user?.role) params.user_role = user.role;
  try {
    const res = await inventoryApi.legacyPr.list(params);
    const rows = res?.data?.data?.requisitions ?? res?.data?.requisitions ?? [];
    return rows.map(normalizeLegacyPR);
  } catch {
    return [];
  }
}

/** The two legacy statuses that mean "approved and ready for a PO". */
export async function fetchLegacyApprovedPRs(user) {
  const [a, b] = await Promise.all([
    fetchLegacyPRs({ status: 'approved', user }),
    fetchLegacyPRs({ status: 'adjusted_approved', user }),
  ]);
  return [...a, ...b];
}
