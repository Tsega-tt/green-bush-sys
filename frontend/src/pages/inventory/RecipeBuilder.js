import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import apiService from '../../services/api';
import inventoryApi from '../../services/inventoryApi';
import {
  PageHeader, Btn, DataTable, Modal, Select, TextInput, StatusBadge,
  fmtMoney, fmtNum, useApiResource, useSubmitGuard,
} from '../../components/inventory/kit';

const UOMS = ['pcs', 'kg', 'g', 'l', 'ml', 'bottle', 'shot', 'portion'];
const blankComp = () => ({ item_id: '', quantity: '', uom: 'g', waste_factor_pct: 0 });

/** Legacy menu can return several shapes — normalize to [{id,name,category,price}]. */
function normalizeMenu(res) {
  const d = res?.data;
  const arr = d?.data?.menuItems || d?.data?.items || d?.menuItems || d?.items || d?.menu
    || (Array.isArray(d?.data) ? d.data : null) || (Array.isArray(d) ? d : []);
  return (arr || []).map((m) => ({ id: m.id, name: m.name, category: m.category, price: m.price ?? m.selling_price }));
}

export default function RecipeBuilder() {
  const [menu, setMenu] = useState([]);
  const [items, setItems] = useState([]);
  const [stores, setStores] = useState([]);
  const [servingSizes, setServingSizes] = useState([]);
  const [availability, setAvailability] = useState({});
  const [editor, setEditor] = useState(null);

  const { data: recipes, loading, error, refetch } = useApiResource(
    () => inventoryApi.recipes.list().then((r) => r.data.data.recipes || []), []
  );

  useEffect(() => {
    apiService.menu.getAll().then((r) => setMenu(normalizeMenu(r))).catch(() => {});
    inventoryApi.items.list({ limit: 1000 }).then((r) => setItems(r.data.data.items || [])).catch(() => {});
    inventoryApi.stores.list().then((r) => setStores((r.data.data.stores || []).filter((s) => s.is_active !== false))).catch(() => {});
    inventoryApi.servingSizes.list({ active: true }).then((r) => setServingSizes(r.data.data.serving_sizes || [])).catch(() => {});
  }, []);

  // Real-time-ish availability for the listed recipes.
  useEffect(() => {
    const ids = (recipes || []).map((r) => r.menu_item_id);
    if (!ids.length) return;
    inventoryApi.recipes.availabilityMany(ids).then((r) => setAvailability(r.data.data.availability || {})).catch(() => {});
  }, [recipes]);

  const menuById = useMemo(() => new Map(menu.map((m) => [Number(m.id), m])), [menu]);
  const nameOf = (id) => (menuById.get(Number(id))?.name || `Menu #${id}`);

  const columns = [
    { key: 'menu', label: 'Menu item', render: (r) => <span className="font-medium">{nameOf(r.menu_item_id)}</span> },
    { key: 'store_name', label: 'Responsible store' },
    { key: 'controlled', label: 'Controlled', render: (r) => (r.inventory_controlled ? 'Yes' : 'No') },
    { key: 'component_count', label: 'Ingredients', align: 'right' },
    { key: 'recipe_cost', label: 'Cost', align: 'right', render: (r) => fmtMoney(r.recipe_cost) },
    { key: 'selling_price', label: 'Price', align: 'right', render: (r) => (r.selling_price != null ? fmtMoney(r.selling_price) : '-') },
    { key: 'margin_pct', label: 'Margin', align: 'right', render: (r) => (r.margin_pct != null ? `${r.margin_pct}%` : '-') },
    { key: 'avail', label: 'Availability', render: (r) => {
      const a = availability[r.menu_item_id];
      if (!a) return <span className="text-gray-300">…</span>;
      if (a.available_units == null) return <StatusBadge value="approved" />;
      return a.in_stock
        ? <span className="text-green-600 text-sm font-medium">{fmtNum(a.available_units)} left</span>
        : <StatusBadge value="critical" />;
    } },
    { key: 'actions', label: '', align: 'right', render: (r) => <Btn onClick={() => setEditor({ menu_item_id: r.menu_item_id, existing: r })}>Edit</Btn> },
  ];

  const recipeIds = new Set((recipes || []).map((r) => Number(r.menu_item_id)));
  const menuWithout = menu.filter((m) => !recipeIds.has(Number(m.id)));

  return (
    <div className="p-4 md:p-6">
      <PageHeader title="Menu Recipes (BOM)">
        <Btn variant="primary" onClick={() => setEditor({ menu_item_id: '', existing: null })}>Add recipe</Btn>
      </PageHeader>
      <DataTable columns={columns} rows={recipes || []} loading={loading} error={error} onRetry={refetch} keyField="menu_item_id" empty="No recipes yet — add one to link a menu item to its store inventory" />

      {editor && (
        <RecipeEditor
          editor={editor} menu={menu} menuWithout={menuWithout} items={items} stores={stores} servingSizes={servingSizes}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); refetch(); }}
        />
      )}
    </div>
  );
}

function RecipeEditor({ editor, menu, menuWithout, items, stores, servingSizes, onClose, onSaved }) {
  const isNew = !editor.existing;
  const [menuItemId, setMenuItemId] = useState(editor.menu_item_id || '');
  const [storeId, setStoreId] = useState(editor.existing?.store_id ? String(editor.existing.store_id) : '');
  const [servingSizeId, setServingSizeId] = useState(editor.existing?.serving_size_id ? String(editor.existing.serving_size_id) : '');
  const selectedStore = stores.find((s) => String(s.id) === String(storeId));
  const isKegStore = !!selectedStore && (selectedStore.capabilities || []).includes('requires_keg_tracking');
  const [settings, setSettings] = useState({
    inventory_controlled: editor.existing ? editor.existing.inventory_controlled !== false : true,
    auto_deduct: editor.existing ? editor.existing.auto_deduct !== false : true,
    allow_sale_when_insufficient: editor.existing ? !!editor.existing.allow_sale_when_insufficient : false,
    waste_factor_pct: editor.existing?.waste_factor_pct ?? 0,
    selling_price: editor.existing?.selling_price ?? '',
  });
  const [comps, setComps] = useState([blankComp()]);
  const [wac, setWac] = useState({}); // item_id -> weighted_avg_cost for selected store
  const [busy, run] = useSubmitGuard();

  // Load existing components when editing.
  useEffect(() => {
    if (!editor.existing) return;
    inventoryApi.recipes.get(editor.menu_item_id).then((r) => {
      const rec = r.data.data.recipe;
      setComps((rec.components || []).map((c) => ({ item_id: String(c.item_id), quantity: c.quantity, uom: c.uom, waste_factor_pct: c.waste_factor_pct || 0 })) || [blankComp()]);
      if (rec.selling_price != null) setSettings((s) => ({ ...s, selling_price: rec.selling_price }));
    }).catch(() => {});
  }, [editor]);

  // When a store is chosen, pull its balances so we can cost the recipe live.
  useEffect(() => {
    if (!storeId) { setWac({}); return; }
    inventoryApi.balances({ store_id: storeId }).then((r) => {
      const m = {};
      (r.data.data.balances || []).forEach((b) => { m[Number(b.item_id)] = Number(b.weighted_avg_cost); });
      setWac(m);
    }).catch(() => {});
  }, [storeId]);

  const onPickMenu = (id) => {
    setMenuItemId(id);
    const m = menu.find((x) => String(x.id) === String(id));
    if (m && m.price != null && !settings.selling_price) setSettings((s) => ({ ...s, selling_price: m.price }));
  };

  const setComp = (i, patch) => setComps((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const recipeWaste = Number(settings.waste_factor_pct) || 0;

  const liveCost = comps.reduce((sum, c) => {
    const q = Number(c.quantity) || 0;
    const w = (Number(c.waste_factor_pct) || 0) + recipeWaste;
    const unitCost = wac[Number(c.item_id)] || 0;
    return sum + q * (1 + w / 100) * unitCost;
  }, 0);
  const price = Number(settings.selling_price) || 0;
  const margin = price ? Math.round(((price - liveCost) / price) * 1000) / 10 : null;

  const save = (e) => {
    e.preventDefault();
    if (!menuItemId) { toast.error('Pick a menu item'); return; }
    if (!storeId) { toast.error('Pick a responsible store'); return; }
    if (isKegStore && !servingSizeId) { toast.error('Pick a serving size for this draft product'); return; }
    const clean = comps.filter((c) => c.item_id && Number(c.quantity) > 0);
    if (settings.inventory_controlled && clean.length === 0) { toast.error('Add at least one ingredient'); return; }
    run(async () => {
      try {
        await inventoryApi.recipes.set(Number(menuItemId), {
          store_id: Number(storeId),
          inventory_controlled: settings.inventory_controlled,
          auto_deduct: settings.auto_deduct,
          allow_sale_when_insufficient: settings.allow_sale_when_insufficient,
          waste_factor_pct: Number(settings.waste_factor_pct) || 0,
          selling_price: settings.selling_price === '' ? undefined : Number(settings.selling_price),
          serving_size_id: isKegStore && servingSizeId ? Number(servingSizeId) : undefined,
          components: clean.map((c) => ({ item_id: Number(c.item_id), quantity: Number(c.quantity), uom: c.uom, waste_factor_pct: Number(c.waste_factor_pct) || 0 })),
        });
        toast.success('Recipe saved');
        onSaved();
      } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    });
  };

  return (
    <Modal title={isNew ? 'Add recipe' : `Recipe — ${menu.find((m) => Number(m.id) === Number(menuItemId))?.name || `#${menuItemId}`}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="block text-gray-600 mb-1">Menu item</span>
            <select className="w-full border rounded-lg px-3 py-2" value={menuItemId} disabled={!isNew}
              onChange={(e) => onPickMenu(e.target.value)}>
              <option value="">Select…</option>
              {(isNew ? menuWithout : menu).map((m) => <option key={m.id} value={m.id}>{m.name} {m.category ? `(${m.category})` : ''}</option>)}
            </select>
          </label>
          <Select label="Responsible store" required value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Select…</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ''}{s.name}</option>)}
          </Select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.inventory_controlled} onChange={(e) => setSettings({ ...settings, inventory_controlled: e.target.checked })} /> Inventory controlled</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.auto_deduct} onChange={(e) => setSettings({ ...settings, auto_deduct: e.target.checked })} /> Auto-deduct</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.allow_sale_when_insufficient} onChange={(e) => setSettings({ ...settings, allow_sale_when_insufficient: e.target.checked })} /> Allow oversell</label>
          <TextInput label="Recipe waste %" type="number" step="0.1" min="0" value={settings.waste_factor_pct} onChange={(e) => setSettings({ ...settings, waste_factor_pct: e.target.value })} />
        </div>

        {isKegStore && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3 items-end">
              <Select label="🍺 Draft serving size" required value={servingSizeId} onChange={(e) => setServingSizeId(e.target.value)}>
                <option value="">Select serving size…</option>
                {servingSizes.map((s) => <option key={s.id} value={s.id}>{s.name} — {Number(s.liter_quantity)} L</option>)}
              </Select>
              <p className="text-xs text-gray-500 pb-2">This is a keg-tracked store. Each sale deducts the serving liters (from the configurable size above) from the active keg. The single ingredient below identifies the beverage item.</p>
            </div>
          </div>
        )}

        <div className="border rounded-lg p-3">
          <div className="text-sm font-semibold text-gray-700 mb-2">Ingredients (from {storeId ? 'this store' : 'inventory'})</div>
          {comps.map((c, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
              <select className="col-span-5 border rounded-lg px-2 py-2 text-sm" value={c.item_id} onChange={(e) => setComp(i, { item_id: e.target.value })}>
                <option value="">Ingredient…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.description}</option>)}
              </select>
              <input className="col-span-2 border rounded-lg px-2 py-2 text-sm" placeholder="Qty" type="number" step="0.001" value={c.quantity} onChange={(e) => setComp(i, { quantity: e.target.value })} />
              <select className="col-span-2 border rounded-lg px-2 py-2 text-sm" value={c.uom} onChange={(e) => setComp(i, { uom: e.target.value })}>
                {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <input className="col-span-2 border rounded-lg px-2 py-2 text-sm" placeholder="Waste %" type="number" step="0.1" value={c.waste_factor_pct} onChange={(e) => setComp(i, { waste_factor_pct: e.target.value })} />
              <button type="button" className="col-span-1 text-red-500" onClick={() => setComps((cs) => cs.filter((_, idx) => idx !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="text-sm text-blue-600" onClick={() => setComps((cs) => [...cs, blankComp()])}>+ add ingredient</button>
        </div>

        <div className="grid grid-cols-3 gap-3 items-end">
          <TextInput label="Selling price" type="number" step="0.01" min="0" value={settings.selling_price} onChange={(e) => setSettings({ ...settings, selling_price: e.target.value })} />
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="text-gray-500">Recipe cost (live)</div>
            <div className="font-bold text-lg">{fmtMoney(liveCost)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="text-gray-500">Gross margin</div>
            <div className={`font-bold text-lg ${margin != null && margin < 0 ? 'text-red-600' : 'text-green-700'}`}>{margin != null ? `${margin}%` : '—'}</div>
          </div>
        </div>
        {!storeId && <p className="text-xs text-gray-400">Pick a store to see live cost (uses that store's weighted-average cost).</p>}

        <div className="flex justify-end gap-2">
          <Btn type="button" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save recipe'}</Btn>
        </div>
      </form>
    </Modal>
  );
}
