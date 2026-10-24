import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dashboard from '../src/pages/Dashboard';
import { useDashboardStore } from '../src/store/dashboardSlice';
import * as api from '../src/services/api';

vi.mock('../src/services/api', () => ({
  fetchDashboards: vi.fn(), fetchDashboardData: vi.fn(), createWidget: vi.fn(),
  deleteWidget: vi.fn(), fetchComments: vi.fn(), createComment: vi.fn(), deleteComment: vi.fn(),
  createDashboard: vi.fn(), duplicateDashboard: vi.fn(), shareDashboard: vi.fn()
}));
vi.mock('../src/components/Dashboard/DashboardGrid', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('../src/components/Dashboard/CreateDashboardModal', () => ({ default: () => null }));
vi.mock('../src/components/Dashboard/AddWidgetModal', () => ({
  default: ({ onSubmit }: any) => <button onClick={() => onSubmit({ name: 'New', type: 'text', config: {} })}>Confirm add</button>
}));

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  notifyManager.setNotifyFunction(callback => act(callback));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  useDashboardStore.setState({ dashboards: [], currentDashboard: null });
  vi.restoreAllMocks();
  vi.resetAllMocks();
  notifyManager.setNotifyFunction(callback => callback());
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

it.each(['add', 'delete'])('refreshes the real dashboard card count after widget %s', async operation => {
  let count = 1;
  const widgets = () => Array.from({ length: count }, (_, i) => ({
    id: `w${i}`, name: 'Test widget', type: 'text', config: {}, position: { x: 0, y: 0, w: 1, h: 1 }
  }));
  vi.mocked(api.fetchDashboards).mockImplementation(async () => [{ id: 'a', name: 'Demo', _count: { widgets: count } }]);
  vi.mocked(api.fetchDashboardData).mockImplementation(async () => ({
    dashboard: { id: 'a', name: 'Demo', layout: 'grid', widgets: widgets() }, widgetData: []
  }));
  vi.mocked(api.createWidget).mockImplementation(async () => { count++; return widgets()[1]; });
  vi.mocked(api.deleteWidget).mockImplementation(async () => { count--; });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } } });
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  function BackToList() {
    const navigate = useNavigate();
    return <button onClick={() => navigate('/dashboard')}>Back to list</button>;
  }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(item => item.textContent === label);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }
  try {
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={['/dashboard/a']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <BackToList /><Routes><Route path="/dashboard/:dashboardId?" element={<Dashboard />} /></Routes>
      </MemoryRouter></QueryClientProvider>
    ));
    await vi.waitFor(() => expect(element.textContent).toContain('Test widget'));
    if (operation === 'add') {
      await click('Add Widget'); await click('Confirm add');
    } else {
      act(() => (element.querySelector('.widget-drag-handle button') as HTMLButtonElement).click());
      await click('Delete');
    }
    await vi.waitFor(() => expect(count).toBe(operation === 'add' ? 2 : 0));
    await click('Back to list');
    await vi.waitFor(() => expect(element.textContent).toContain(`${count} widgets`));
    expect(api.fetchDashboards).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount()); client.clear(); element.remove();
  }
});
