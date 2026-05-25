import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiCreditCard,
  FiDollarSign,
  FiEdit2,
  FiFilter,
  FiPieChart,
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiX,
  FiTrendingUp
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/common/LoadingSpinner';

const DEFAULT_CATEGORIES = [
  'Food & Ingredients',
  'Beverages',
  'Employee Salaries',
  'Utilities',
  'Rent',
  'Maintenance',
  'Cleaning & Supplies',
  'Equipment Purchase',
  'Marketing',
  'Other'
];

const DEFAULT_PAYMENT_METHODS = ['Cash', 'Bank', 'Mobile Money'];

const INITIAL_FORM = {
  title: '',
  category: 'Food & Ingredients',
  amount: '',
  paid_to: '',
  notes: '',
  payment_method: 'Cash'
};

const INITIAL_FILTERS = {
  search: '',
  category: '',
  payment_method: '',
  dateFrom: '',
  dateTo: '',
  minAmount: '',
  maxAmount: ''
};

const getDefaultFormState = (categories = DEFAULT_CATEGORIES, paymentMethods = DEFAULT_PAYMENT_METHODS) => ({
  ...INITIAL_FORM,
  category: categories[0] || INITIAL_FORM.category,
  payment_method: paymentMethods[0] || INITIAL_FORM.payment_method
});

const mapExpenseToFormData = (expense, categories = DEFAULT_CATEGORIES, paymentMethods = DEFAULT_PAYMENT_METHODS) => ({
  title: String(expense?.title || '').trim(),
  category: String(expense?.category || categories[0] || INITIAL_FORM.category).trim(),
  amount: String(expense?.amount ?? expense?.total ?? ''),
  paid_to: String(expense?.paid_to || '').trim(),
  notes: String(expense?.notes || '').trim(),
  payment_method: String(expense?.payment_method || paymentMethods[0] || INITIAL_FORM.payment_method).trim()
});

const formatCurrency = (value) => {
  const amount = Number.parseFloat(value || 0);
  if (!Number.isFinite(amount)) return 'ETB 0.00';
  return `ETB ${amount.toFixed(2)}`;
};

const formatDateTime = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const StatCard = ({ title, value, subtitle, icon: Icon, accent = 'from-emerald-500 to-teal-500' }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        {subtitle ? <p className="mt-2 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-white shadow-lg`}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const SectionCard = ({ title, icon: Icon, action, children, className = '' }) => (
  <div className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`.trim()}>
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const TrendChart = ({ title, data, colorClass }) => {
  const normalized = Array.isArray(data) ? data : [];
  const maxAmount = normalized.reduce((max, item) => Math.max(max, Number.parseFloat(item?.amount || 0)), 0);

  return (
    <SectionCard title={title} icon={FiTrendingUp}>
      {normalized.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-500">
          No trend data available yet.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex h-64 items-end gap-2 overflow-x-auto rounded-2xl bg-gray-50 p-4">
            {normalized.map((item) => {
              const amount = Number.parseFloat(item?.amount || 0);
              const height = maxAmount > 0 ? Math.max(12, Math.round((amount / maxAmount) * 180)) : 12;
              return (
                <div key={item?.label} className="flex min-w-[56px] flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-gray-500">{formatCurrency(amount).replace('ETB ', '')}</span>
                  <div className={`w-full rounded-t-2xl ${colorClass}`} style={{ height }} />
                  <span className="text-center text-[11px] text-gray-500">{item?.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
};

const ExpenseManagement = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [paymentMethods, setPaymentMethods] = useState(DEFAULT_PAYMENT_METHODS);
  const [formData, setFormData] = useState(() => getDefaultFormState());
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dashboard, setDashboard] = useState({ cards: null, recent_expenses: [], trends: { daily: [], monthly: [] } });
  const [reports, setReports] = useState({ totals: null, category_totals: [], top_expenses: [], expense_vs_sales: null });
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState(null);

  const loadExpenseData = useCallback(async (activeFilters, showFullLoader = false) => {
    try {
      if (showFullLoader) setLoading(true);
      else setRefreshing(true);

      const [metaRes, listRes, dashboardRes, reportsRes] = await Promise.all([
        api.expenses.getMeta(),
        api.expenses.getAll(activeFilters),
        api.expenses.getDashboard(activeFilters),
        api.expenses.getReports(activeFilters)
      ]);

      const metaData = metaRes?.data?.data || metaRes?.data || {};
      const listData = listRes?.data?.data || listRes?.data || {};
      const dashboardData = dashboardRes?.data?.data || dashboardRes?.data || {};
      const reportsData = reportsRes?.data?.data || reportsRes?.data || {};

      setCategories(Array.isArray(metaData.categories) && metaData.categories.length > 0 ? metaData.categories : DEFAULT_CATEGORIES);
      setPaymentMethods(
        Array.isArray(metaData.payment_methods) && metaData.payment_methods.length > 0
          ? metaData.payment_methods
          : DEFAULT_PAYMENT_METHODS
      );
      if (!editingExpenseId) {
        setFormData((prev) => ({
          ...prev,
          category: prev.category || metaData.categories?.[0] || DEFAULT_CATEGORIES[0],
          payment_method: prev.payment_method || metaData.payment_methods?.[0] || DEFAULT_PAYMENT_METHODS[0]
        }));
      }
      setExpenses(Array.isArray(listData.expenses) ? listData.expenses : []);
      setSummary(listData.summary || listRes?.data?.summary || null);
      setDashboard({
        cards: dashboardData.cards || dashboardRes?.data?.cards || null,
        recent_expenses: Array.isArray(dashboardData.recent_expenses)
          ? dashboardData.recent_expenses
          : (Array.isArray(dashboardRes?.data?.recent_expenses) ? dashboardRes.data.recent_expenses : []),
        trends: {
          daily: Array.isArray(dashboardData?.trends?.daily)
            ? dashboardData.trends.daily
            : (Array.isArray(dashboardRes?.data?.trends?.daily) ? dashboardRes.data.trends.daily : []),
          monthly: Array.isArray(dashboardData?.trends?.monthly)
            ? dashboardData.trends.monthly
            : (Array.isArray(dashboardRes?.data?.trends?.monthly) ? dashboardRes.data.trends.monthly : [])
        }
      });
      setReports({
        totals: reportsData.totals || reportsRes?.data?.totals || null,
        category_totals: Array.isArray(reportsData.category_totals)
          ? reportsData.category_totals
          : (Array.isArray(reportsRes?.data?.category_totals) ? reportsRes.data.category_totals : []),
        top_expenses: Array.isArray(reportsData.top_expenses)
          ? reportsData.top_expenses
          : (Array.isArray(reportsRes?.data?.top_expenses) ? reportsRes.data.top_expenses : []),
        expense_vs_sales: reportsData.expense_vs_sales || reportsRes?.data?.expense_vs_sales || null
      });
    } catch (error) {
      console.error('Failed to load expense data:', error);
      toast.error(error?.response?.data?.message || 'Failed to load expense management data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadExpenseData(INITIAL_FILTERS, true);
  }, [loadExpenseData]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const resetExpenseForm = useCallback(() => {
    setEditingExpenseId(null);
    setFormData(getDefaultFormState(categories, paymentMethods));
  }, [categories, paymentMethods]);

  const handleSubmitExpense = async (event) => {
    event.preventDefault();

    const amount = Number.parseFloat(formData.amount);
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!formData.paid_to.trim()) {
      toast.error('Paid to is required');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        ...formData,
        amount,
        user_id: user?.id ?? user?.user_id ?? null
      };

      if (editingExpenseId) {
        await api.expenses.update(editingExpenseId, payload);
        toast.success('Expense updated successfully');
      } else {
        await api.expenses.create(payload);
        toast.success('Expense saved successfully');
      }

      resetExpenseForm();
      await loadExpenseData(filters);
    } catch (error) {
      console.error('Save expense failed:', error);
      toast.error(error?.response?.data?.message || 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditExpense = (expense) => {
    setEditingExpenseId(expense?.id ?? null);
    setFormData(mapExpenseToFormData(expense, categories, paymentMethods));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteExpense = async (expense) => {
    if (!expense?.id) return;
    if (!window.confirm(`Delete expense "${expense.title}"?`)) return;

    try {
      setDeletingExpenseId(expense.id);
      await api.expenses.delete(expense.id);
      toast.success('Expense deleted successfully');
      if (editingExpenseId === expense.id) {
        resetExpenseForm();
      }
      await loadExpenseData(filters);
    } catch (error) {
      console.error('Delete expense failed:', error);
      toast.error(error?.response?.data?.message || 'Failed to delete expense');
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const applyFilters = async (event) => {
    event.preventDefault();
    await loadExpenseData(filters);
  };

  const resetFilters = async () => {
    setFilters(INITIAL_FILTERS);
    await loadExpenseData(INITIAL_FILTERS);
  };

  const topCategory = dashboard?.cards?.top_category || summary?.top_category || null;
  const totals = reports?.totals || {};
  const expenseVsSales = reports?.expense_vs_sales || null;

  const totalVisibleAmount = useMemo(
    () => expenses.reduce((sum, expense) => sum + Number.parseFloat(expense?.amount || expense?.total || 0), 0),
    [expenses]
  );
  const isEditMode = editingExpenseId != null;

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 rounded-3xl bg-gradient-to-r from-slate-900 via-emerald-900 to-teal-800 p-6 text-white shadow-xl md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Expense Management</h1>
          <p className="mt-2 max-w-2xl text-sm text-emerald-50 md:text-base">
            Track operating costs, review spending patterns, and compare expenses against sales from one admin workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-100">Visible expenses</p>
            <p className="mt-1 text-xl font-semibold">{formatCurrency(totalVisibleAmount)}</p>
          </div>
          <button
            type="button"
            onClick={() => loadExpenseData(filters)}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            disabled={refreshing}
          >
            <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Expenses Today"
          value={formatCurrency(dashboard?.cards?.today_total || summary?.today_total || 0)}
          subtitle="Updated from live expense activity"
          icon={FiDollarSign}
          accent="from-emerald-500 to-green-500"
        />
        <StatCard
          title="Expenses This Week"
          value={formatCurrency(dashboard?.cards?.week_total || summary?.week_total || 0)}
          subtitle="Current week spend"
          icon={FiCalendar}
          accent="from-cyan-500 to-sky-500"
        />
        <StatCard
          title="Expenses This Month"
          value={formatCurrency(dashboard?.cards?.month_total || summary?.month_total || 0)}
          subtitle={`${summary?.total_count || expenses.length || 0} recorded entries`}
          icon={FiBarChart2}
          accent="from-violet-500 to-purple-500"
        />
        <StatCard
          title="Top Spending Category"
          value={topCategory?.category || '—'}
          subtitle={topCategory ? formatCurrency(topCategory.total) : 'No category data yet'}
          icon={FiPieChart}
          accent="from-amber-500 to-orange-500"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.95fr]">
        <SectionCard
          title={isEditMode ? 'Edit Expense Entry' : 'New Expense Entry'}
          icon={isEditMode ? FiEdit2 : FiPlus}
          action={isEditMode ? (
            <button
              type="button"
              onClick={resetExpenseForm}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              <FiX />
              Cancel
            </button>
          ) : null}
        >
          <form onSubmit={handleSubmitExpense} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
              <input
                name="title"
                value={formData.title}
                onChange={handleFormChange}
                className="input-field"
                placeholder="Monthly electricity bill"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <select name="category" value={formData.category} onChange={handleFormChange} className="input-field">
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Amount</label>
                <input
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={handleFormChange}
                  className="input-field"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Paid To</label>
                <input
                  name="paid_to"
                  value={formData.paid_to}
                  onChange={handleFormChange}
                  className="input-field"
                  placeholder="EEU / Supplier name"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Method</label>
                <select
                  name="payment_method"
                  value={formData.payment_method}
                  onChange={handleFormChange}
                  className="input-field"
                >
                  {paymentMethods.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleFormChange}
                rows={4}
                className="input-field resize-none"
                placeholder="Optional context for reporting and audits"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="submit" className="btn-primary inline-flex w-full items-center justify-center gap-2" disabled={submitting}>
                {isEditMode ? <FiEdit2 /> : <FiPlus />}
                {submitting ? 'Saving...' : (isEditMode ? 'Update Expense' : 'Save Expense')}
              </button>
              {isEditMode ? (
                <button
                  type="button"
                  onClick={resetExpenseForm}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  <FiX />
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
        </SectionCard>

        <div className="grid gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <TrendChart title="Daily Expense Trend" data={dashboard?.trends?.daily} colorClass="bg-gradient-to-t from-emerald-500 to-emerald-300" />
            <TrendChart title="Monthly Expense Trend" data={dashboard?.trends?.monthly} colorClass="bg-gradient-to-t from-cyan-500 to-sky-300" />
          </div>
          <SectionCard title="Recent Expenses" icon={FiClock}>
            <div className="space-y-3">
              {(dashboard?.recent_expenses || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  No recent expenses to display.
                </div>
              ) : (
                dashboard.recent_expenses.map((expense) => (
                  <div key={expense.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 p-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{expense.title}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {expense.category} · {expense.payment_method} · {expense.paid_to || 'No payee'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">{formatCurrency(expense.amount || expense.total)}</p>
                      <p className="mt-1 text-xs text-gray-500">{formatDateTime(expense.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Filters"
        icon={FiFilter}
        action={
          <button type="button" onClick={resetFilters} className="text-sm font-semibold text-emerald-600 hover:text-emerald-700">
            Reset filters
          </button>
        }
      >
        <form onSubmit={applyFilters} className="grid gap-4 lg:grid-cols-4">
          <input
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            className="input-field lg:col-span-2"
            placeholder="Search by title, category, paid to, notes"
          />
          <select name="category" value={filters.category} onChange={handleFilterChange} className="input-field">
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select name="payment_method" value={filters.payment_method} onChange={handleFilterChange} className="input-field">
            <option value="">All payment methods</option>
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
          <input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleFilterChange} className="input-field" />
          <input name="dateTo" type="date" value={filters.dateTo} onChange={handleFilterChange} className="input-field" />
          <input
            name="minAmount"
            type="number"
            min="0"
            step="0.01"
            value={filters.minAmount}
            onChange={handleFilterChange}
            className="input-field"
            placeholder="Min amount"
          />
          <input
            name="maxAmount"
            type="number"
            min="0"
            step="0.01"
            value={filters.maxAmount}
            onChange={handleFilterChange}
            className="input-field"
            placeholder="Max amount"
          />
          <button type="submit" className="btn-primary inline-flex items-center justify-center gap-2 lg:col-span-4">
            <FiFilter />
            Apply Filters
          </button>
        </form>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1.2fr_1.6fr]">
        <SectionCard title="Report Totals" icon={FiBarChart2}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-sm font-medium text-emerald-700">Daily</p>
              <p className="mt-2 text-xl font-bold text-emerald-900">{formatCurrency(totals.daily)}</p>
            </div>
            <div className="rounded-2xl bg-cyan-50 p-4">
              <p className="text-sm font-medium text-cyan-700">Weekly</p>
              <p className="mt-2 text-xl font-bold text-cyan-900">{formatCurrency(totals.weekly)}</p>
            </div>
            <div className="rounded-2xl bg-violet-50 p-4">
              <p className="text-sm font-medium text-violet-700">Monthly</p>
              <p className="mt-2 text-xl font-bold text-violet-900">{formatCurrency(totals.monthly)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-700">Yearly</p>
              <p className="mt-2 text-xl font-bold text-amber-900">{formatCurrency(totals.yearly)}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Category Spend" icon={FiPieChart}>
          <div className="space-y-3">
            {(reports.category_totals || []).length === 0 ? (
              <p className="text-sm text-gray-500">No category totals available.</p>
            ) : (
              reports.category_totals.map((item) => (
                <div key={item.category_key} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{item.category}</p>
                      <p className="text-xs text-gray-500">{item.count} entries</p>
                    </div>
                    <p className="font-semibold text-emerald-600">{formatCurrency(item.total)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="Top 5 Biggest Expenses" icon={FiTrendingUp}>
          <div className="space-y-3">
            {(reports.top_expenses || []).length === 0 ? (
              <p className="text-sm text-gray-500">No expenses available.</p>
            ) : (
              reports.top_expenses.map((expense) => (
                <div key={expense.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{expense.title}</p>
                      <p className="mt-1 text-sm text-gray-500">{expense.category} · {expense.payment_method}</p>
                    </div>
                    <p className="font-semibold text-rose-600">{formatCurrency(expense.amount || expense.total)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Expenses vs Sales" icon={FiCreditCard}>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Expenses</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(expenseVsSales?.total_expenses)}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Sales</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(expenseVsSales?.total_sales)}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Difference</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(expenseVsSales?.difference)}</p>
          </div>
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-500">Expense Ratio</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{Number.parseFloat(expenseVsSales?.expense_ratio || 0).toFixed(2)}%</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          Comparison window: {expenseVsSales?.date_from ? formatDateTime(expenseVsSales.date_from) : '—'} to {expenseVsSales?.date_to ? formatDateTime(expenseVsSales.date_to) : '—'}
        </p>
      </SectionCard>

      <SectionCard title="Expense Records" icon={FiDollarSign}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Paid To</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">
                    No expense records match the current filters.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 align-top">
                      <div>
                        <p className="font-semibold text-gray-900">{expense.title}</p>
                        {expense.notes ? <p className="mt-1 max-w-md text-sm text-gray-500">{expense.notes}</p> : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{expense.category}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{expense.paid_to || '—'}</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{expense.payment_method}</td>
                    <td className="px-4 py-4 text-sm font-semibold text-emerald-600">{formatCurrency(expense.amount || expense.total)}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">{formatDateTime(expense.created_at)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditExpense(expense)}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                        >
                          <FiEdit2 />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(expense)}
                          disabled={deletingExpenseId === expense.id}
                          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FiTrash2 />
                          {deletingExpenseId === expense.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
};

export default ExpenseManagement;
