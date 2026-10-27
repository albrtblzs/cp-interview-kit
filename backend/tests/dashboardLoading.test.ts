import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import router from '../src/routes/dashboard';

const mockFindDashboard = jest.fn();
const mockAnalytics = { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() };
jest.mock('../src/index', () => ({
  prisma: {
    dashboard: { findFirst: (...args: any[]) => mockFindDashboard(...args) },
    analyticsEvent: {
      count: (...args: any[]) => mockAnalytics.count(...args),
      groupBy: (...args: any[]) => mockAnalytics.groupBy(...args),
      findMany: (...args: any[]) => mockAnalytics.findMany(...args)
    }
  }, broadcastToOrg: jest.fn()
}));

describe('dashboard batch loading', () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    const app = express();
    app.use((req: any, _res, next) => { req.user = { organizationId: 'org-a' }; next(); });
    app.use(router);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dashboard-a/data`;
  });
  afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
  beforeEach(() => {
    jest.resetAllMocks();
    mockAnalytics.count.mockResolvedValue(120);
    mockAnalytics.groupBy.mockResolvedValue([{ eventType: 'demo', _count: 120 }]);
    mockAnalytics.findMany.mockResolvedValue([{ id: 'latest-event' }]);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([1, 10, 30])('uses one metric query for %i widgets', async count => {
    mockFindDashboard.mockResolvedValue({ id: 'dashboard-a', widgets: Array.from({ length: count }, (_, i) => ({ id: `w${i}`, type: 'metric' })) });
    const response = await fetch(url);
    const body: any = await response.json();
    expect(response.status).toBe(200);
    expect(body.widgetData).toHaveLength(count);
    expect(body.widgetData.every(item => item.data === 120)).toBe(true);
    expect(mockFindDashboard).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'dashboard-a', organizationId: 'org-a' } }));
    expect(mockFindDashboard.mock.calls[0][0].include.widgets).toEqual({
      where: { organizationId: 'org-a' }, orderBy: { createdAt: 'asc' }
    });
    expect(mockAnalytics.count).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.count).toHaveBeenCalledWith({ where: { organizationId: 'org-a' } });
    expect(mockAnalytics.groupBy).not.toHaveBeenCalled();
    expect(mockAnalytics.findMany).not.toHaveBeenCalled();
  });

  it('reuses each type query and preserves individual-widget table semantics', async () => {
    const types = ['metric', 'chart', 'table', 'text', 'table', 'chart'];
    mockFindDashboard.mockResolvedValue({ id: 'dashboard-a', widgets: types.map((type, i) => ({ id: `w${i}`, type })) });
    const body: any = await (await fetch(url)).json();
    expect(body.widgetData.map(item => item.widgetId)).toEqual(types.map((_, i) => `w${i}`));
    expect(body.widgetData.map(item => item.data)).toEqual([
      120, [{ eventType: 'demo', _count: 120 }], [{ id: 'latest-event' }],
      [], [{ id: 'latest-event' }], [{ eventType: 'demo', _count: 120 }]
    ]);
    for (const method of Object.values(mockAnalytics)) expect(method).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-a' }, orderBy: { timestamp: 'desc' }, take: 100 });
  });

  it('makes no analytics queries for a missing or foreign dashboard', async () => {
    mockFindDashboard.mockResolvedValue(null);
    const response = await fetch(url);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Dashboard not found' });
    for (const method of Object.values(mockAnalytics)) expect(method).not.toHaveBeenCalled();
  });

  it('returns an empty result without analytics queries for an empty dashboard', async () => {
    mockFindDashboard.mockResolvedValue({ id: 'dashboard-a', widgets: [] });
    const body: any = await (await fetch(url)).json();
    expect(body.widgetData).toEqual([]);
    for (const method of Object.values(mockAnalytics)) expect(method).not.toHaveBeenCalled();
  });

  it('returns 500 rather than partial data when an analytics query fails', async () => {
    mockFindDashboard.mockResolvedValue({ id: 'dashboard-a', widgets: [{ id: 'w', type: 'metric' }] });
    mockAnalytics.count.mockRejectedValue(new Error('database unavailable'));
    const response = await fetch(url);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to get dashboard data' });
  });
});
