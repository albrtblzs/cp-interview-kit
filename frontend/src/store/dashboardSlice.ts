import { create } from 'zustand';

import type { Dashboard, DashboardSummary, Widget, WidgetData } from '../types/dashboard';

interface DashboardState {
  dashboards: DashboardSummary[];
  currentDashboard: Dashboard | null;
  isLoading: boolean;
  error: string | null;

  setDashboards: (dashboards: DashboardSummary[]) => void;
  addDashboard: (dashboard: DashboardSummary) => void;
  removeDashboard: (id: string) => void;
  setCurrentDashboard: (dashboard: Dashboard | null) => void;
  updateDashboard: (id: string, updates: Partial<Dashboard>) => void;

  addWidget: (dashboardId: string, widget: Widget) => void;
  updateWidget: (dashboardId: string, widgetId: string, updates: Partial<Widget>) => void;
  removeWidget: (dashboardId: string, widgetId: string) => void;
  setWidgetData: (dashboardId: string, widgetId: string, data: WidgetData) => void;
  reorderWidgets: (dashboardId: string, widgets: Widget[]) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboards: [],
  currentDashboard: null,
  isLoading: false,
  error: null,

  setDashboards: (dashboards) => {
    set({ dashboards });
  },

  addDashboard: (dashboard) => {
    const dashboards = get().dashboards;
    dashboards.push(dashboard);
    set({ dashboards });
  },

  removeDashboard: (id) => {
    // This one is correct (creates new array)
    set({
      dashboards: get().dashboards.filter((d) => d.id !== id),
    });
  },

  setCurrentDashboard: (dashboard) => {
    set({ currentDashboard: dashboard });
  },

  updateDashboard: (id, updates) => {
    const dashboard = get().dashboards.find((d) => d.id === id);
    if (dashboard) {
      Object.assign(dashboard, updates);
      set({ dashboards: get().dashboards });
    }

    // Also update current if it matches
    const current = get().currentDashboard;
    if (current?.id === id) {
      Object.assign(current, updates);
      set({ currentDashboard: current });
    }
  },

  addWidget: (dashboardId, widget) => {
    const current = get().currentDashboard;
    if (current?.id === dashboardId) {
      current.widgets.push(widget);
      set({ currentDashboard: current });
    }
  },

  updateWidget: (dashboardId, widgetId, updates) => {
    set(state => state.currentDashboard?.id === dashboardId ? {
      currentDashboard: {
        ...state.currentDashboard,
        widgets: state.currentDashboard.widgets.map(widget =>
          widget.id === widgetId ? { ...widget, ...updates } : widget),
      },
    } : {});
  },

  removeWidget: (dashboardId, widgetId) => {
    const current = get().currentDashboard;
    if (current?.id === dashboardId) {
      const index = current.widgets.findIndex((w) => w.id === widgetId);
      if (index !== -1) {
        current.widgets.splice(index, 1);
      }
      set({ currentDashboard: current });
    }
  },

  setWidgetData: (dashboardId, widgetId, data) => {
    const current = get().currentDashboard;
    if (current?.id === dashboardId) {
      const widget = current.widgets.find((w) => w.id === widgetId);
      if (widget) {
        widget.data = data;
        set({ currentDashboard: current });
      }
    }
  },

  reorderWidgets: (dashboardId, widgets) => {
    const current = get().currentDashboard;
    if (current?.id === dashboardId) {
      set({ currentDashboard: { ...current, widgets } });
    }
  },
}));
