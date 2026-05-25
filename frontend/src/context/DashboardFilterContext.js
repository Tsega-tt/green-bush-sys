import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api from '../services/api';

const DashboardFilterContext = createContext(null);

const STORAGE_KEY = 'dashboard_filters_v1';

export const DashboardFilterProvider = ({ children, enabled = true }) => {
  const [businessUnit, setBusinessUnit] = useState('all');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('all');
  const [menuItems, setMenuItems] = useState([]);
  const [loadingMenuItems, setLoadingMenuItems] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nextBusinessUnit = typeof parsed?.businessUnit === 'string' ? parsed.businessUnit : null;
      const nextSelectedMenuItemId = typeof parsed?.selectedMenuItemId === 'string' ? parsed.selectedMenuItemId : null;

      if (nextBusinessUnit) setBusinessUnit(nextBusinessUnit);
      if (nextSelectedMenuItemId) setSelectedMenuItemId(nextSelectedMenuItemId);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ businessUnit, selectedMenuItemId }));
    } catch {
      // ignore
    }
  }, [businessUnit, selectedMenuItemId]);

  useEffect(() => {
    if (!enabled) return;
    setSelectedMenuItemId('all');
  }, [businessUnit, enabled]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      setLoadingMenuItems(true);
      try {
        const resp = await api.menu.getAll();
        const items = resp?.data?.data?.menuItems ?? resp?.data?.menuItems ?? [];
        if (cancelled) return;
        setMenuItems(Array.isArray(items) ? items : []);
      } catch {
        if (cancelled) return;
        setMenuItems([]);
      } finally {
        if (cancelled) return;
        setLoadingMenuItems(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const getMenuItemDepartment = useCallback((menuItem) => {
    const explicitMain = String(menuItem?.main_category || '').trim().toLowerCase();
    if (explicitMain.includes('ጾም')) return 'restaurant';
    if (explicitMain === 'bakery') return 'cafe';
    if (explicitMain === 'cafe' || explicitMain === 'restaurant' || explicitMain === 'barista') return explicitMain;

    const cat = String(menuItem?.category || menuItem?.sub_category || '').trim().toLowerCase();
    const name = String(menuItem?.name || '').trim().toLowerCase();
    if (cat.includes('ጾም') || name.includes('ጾም')) return 'restaurant';

    const beverageKeys = ['beverages', 'drinks', 'coffee', 'tea', 'juice', 'smoothie', 'water', 'soda', 'espresso', 'cappuccino', 'latte', 'americano'];
    if (beverageKeys.some((k) => cat.includes(k) || name.includes(k))) return 'barista';

    return null;
  }, []);

  const menuItemsForSelectedUnit = useMemo(() => {
    if (!enabled) return [];
    if (businessUnit === 'all') return [];

    const list = Array.isArray(menuItems) ? menuItems : [];
    return list
      .filter((it) => getMenuItemDepartment(it) === businessUnit)
      .slice()
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [businessUnit, enabled, getMenuItemDepartment, menuItems]);

  const value = useMemo(() => {
    return {
      enabled,
      businessUnit,
      setBusinessUnit,
      selectedMenuItemId,
      setSelectedMenuItemId,
      menuItems,
      menuItemsForSelectedUnit,
      loadingMenuItems,
    };
  }, [enabled, businessUnit, selectedMenuItemId, menuItems, menuItemsForSelectedUnit, loadingMenuItems]);

  return (
    <DashboardFilterContext.Provider value={value}>
      {children}
    </DashboardFilterContext.Provider>
  );
};

export const useDashboardFilters = () => {
  const ctx = useContext(DashboardFilterContext);
  if (!ctx) {
    throw new Error('useDashboardFilters must be used within DashboardFilterProvider');
  }
  return ctx;
};
