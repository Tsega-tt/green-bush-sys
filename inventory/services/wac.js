'use strict';

const { qty, cost } = require('./money');

/**
 * Weighted Average Cost.
 *
 * Only IN-movements (purchase_receipt, transfer_in, opening_balance, positive
 * adjustment) change WAC:
 *
 *   new_qty = old_qty + in_qty
 *   new_wac = (old_qty*old_wac + in_qty*in_unit_cost) / new_qty   (new_qty > 0)
 *
 * OUT-movements do NOT change WAC; they are valued at the current WAC.
 *
 * Edge rule: if new_qty <= 0 (only possible via adjustment/rounding), retain the
 * previous WAC rather than dividing by zero or resetting to 0.
 */
function recomputeWacOnReceipt(oldQty, oldWac, inQty, inUnitCost) {
  const oQty = qty(oldQty);
  const oWac = cost(oldWac);
  const iQty = qty(inQty);
  const iCost = cost(inUnitCost);

  const newQty = qty(oQty + iQty);
  if (newQty <= 0) {
    return { newQty: Math.max(newQty, 0), newWac: oWac };
  }
  const newWac = cost((oQty * oWac + iQty * iCost) / newQty);
  return { newQty, newWac };
}

/** OUT-movement: WAC unchanged, value at current WAC. */
function valueOutMovement(currentWac, outQtyAbs) {
  const c = cost(currentWac);
  return { unitCost: c, totalCost: cost(c * qty(outQtyAbs)) };
}

module.exports = { recomputeWacOnReceipt, valueOutMovement };
