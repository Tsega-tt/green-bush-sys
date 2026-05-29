import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import inventoryApi from '../services/inventoryApi';

/**
 * Subscribe to the inventory SSE stream and invoke `onEvent(type, data)` for
 * each event. Auto-reconnects via EventSource. Pass a stable callback.
 */
export default function useInventoryEvents(onEvent) {
  const { user } = useAuth();
  const cbRef = useRef(onEvent);
  cbRef.current = onEvent;

  useEffect(() => {
    if (!user?.id) return undefined;
    let es;
    try {
      es = inventoryApi.openEventStream(user.id);
    } catch {
      return undefined;
    }
    const handlers = ['inventory.changed', 'transfer.changed', 'pr.changed', 'po.changed', 'grn.changed', 'keg.changed', 'alert.new'];
    const listeners = handlers.map((type) => {
      const fn = (e) => {
        let data = {};
        try { data = JSON.parse(e.data); } catch { /* ignore */ }
        if (cbRef.current) cbRef.current(type, data);
      };
      es.addEventListener(type, fn);
      return [type, fn];
    });
    return () => {
      listeners.forEach(([type, fn]) => es.removeEventListener(type, fn));
      es.close();
    };
  }, [user?.id]);
}
