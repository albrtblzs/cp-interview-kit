import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard';
import { useDashboardStore } from '../src/store/dashboardSlice';
import * as api from '../src/services/api';
import type { Widget } from '../src/types/dashboard';

vi.mock('../src/services/api', () => ({
  fetchDashboards: vi.fn(), fetchDashboard: vi.fn(), fetchDashboardData: vi.fn(),
  fetchWidgetData: vi.fn(), createDashboard: vi.fn(), createWidget: vi.fn(),
  duplicateDashboard: vi.fn(), shareDashboard: vi.fn(), updateWidget: vi.fn()
}));
vi.mock('../src/components/Dashboard/WidgetContainer', async () => {
  const { forwardRef } = await import('react');
  return { default: forwardRef<HTMLSpanElement, { widget: Widget }>(({ widget }, ref) => <span ref={ref}>{widget.id}:{String(widget.data)};</span>) };
});
vi.mock('../src/components/Dashboard/CreateDashboardModal', () => ({ default: () => null }));
vi.mock('../src/components/Dashboard/AddWidgetModal', () => ({ default: () => null }));

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setNotifyFunction(callback => act(callback));
});
afterEach(() => {
  useDashboardStore.setState({ dashboards: [], currentDashboard: null });
  vi.resetAllMocks();
  notifyManager.setNotifyFunction(callback => callback());
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

describe('real dashboard page loading', () => {
  it.each([1, 10, 30])('loads %i widgets using one batch request, without per-widget calls', async count => {
    const widgets = Array.from({ length: count }, (_, index) => ({ id: `w${index}`, type: 'metric', name: 'Metric', config: {}, position: { x: 20, y: index * 3, w: 4, h: 3 } }));
    const dashboard = { id: 'a', name: 'Demo', layout: 'grid', widgets };
    vi.mocked(api.fetchDashboards).mockResolvedValue([{ id: 'a', name: 'Demo', _count: { widgets: count } }]);
    vi.mocked(api.fetchDashboard).mockResolvedValue(dashboard);
    vi.mocked(api.fetchWidgetData).mockImplementation(async (_dashboard, id) => ({ widget: widgets.find(w => w.id === id), data: 120 }));
    vi.mocked(api.fetchDashboardData).mockResolvedValue({ dashboard, widgetData: widgets.map(w => ({ widgetId: w.id, data: 120 })) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);
    try {
      await act(async () => root.render(
        <QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard/a']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes><Route path="/dashboard/:dashboardId" element={<Dashboard />} /></Routes>
        </MemoryRouter></QueryClientProvider>
      ));
      await vi.waitFor(() => expect(element.textContent).toContain(`w${count - 1}:120;`));
      expect(api.fetchDashboardData).toHaveBeenCalledTimes(1);
      expect(api.fetchDashboardData).toHaveBeenCalledWith('a');
      expect(api.fetchDashboard).not.toHaveBeenCalled();
      expect(api.fetchWidgetData).not.toHaveBeenCalled();
      expect(useDashboardStore.getState().currentDashboard?.widgets[0].position.x).toBe(8);
      expect(widgets[0].position.x).toBe(20); // Layout changes must not mutate query data.
    } finally {
      act(() => root.unmount());
      client.clear();
      element.remove();
    }
  });
});
