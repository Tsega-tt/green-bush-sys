import { useEffect, useState } from 'react';
import inventoryApi from '../services/inventoryApi';

/**
 * Loads the small, slow-changing master lists (stores / items / suppliers)
 * once for a page. Pass which lists you need to avoid extra requests.
 */
export default function useMasterData({ stores = true, items = false, suppliers = false } = {}) {
  const [data, setData] = useState({ stores: [], items: [], suppliers: [] });

  useEffect(() => {
    if (stores) inventoryApi.stores.list().then((r) => setData((d) => ({ ...d, stores: r.data.data.stores || [] }))).catch(() => {});
    if (items) inventoryApi.items.list({ limit: 1000 }).then((r) => setData((d) => ({ ...d, items: r.data.data.items || [] }))).catch(() => {});
    if (suppliers) inventoryApi.suppliers.list().then((r) => setData((d) => ({ ...d, suppliers: r.data.data.suppliers || [] }))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}
