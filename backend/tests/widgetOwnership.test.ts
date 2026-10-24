import express from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { Prisma } from '@prisma/client';
import router from '../src/routes/dashboard';

const mockDb = {
  dashboard: { findFirst: jest.fn() },
  widget: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  analyticsEvent: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() }
};
jest.mock('../src/index', () => ({
  prisma: {
    dashboard: { findFirst: (...args: any[]) => mockDb.dashboard.findFirst(...args) },
    widget: {
      findUnique: (...args: any[]) => mockDb.widget.findUnique(...args),
      update: (...args: any[]) => mockDb.widget.update(...args),
      delete: (...args: any[]) => mockDb.widget.delete(...args)
    },
    analyticsEvent: {
      count: (...args: any[]) => mockDb.analyticsEvent.count(...args),
      groupBy: (...args: any[]) => mockDb.analyticsEvent.groupBy(...args),
      findMany: (...args: any[]) => mockDb.analyticsEvent.findMany(...args)
    }
  },
  broadcastToOrg: jest.fn()
}));

describe('widget ownership through the real router', () => {
  let server: Server;
  let base: string;
  let rows: any[];
  const dashboard = { id: 'dashboard-a', organizationId: 'org-a' };
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  const missing = () => new Prisma.PrismaClientKnownRequestError('Not found', {
    code: 'P2025', clientVersion: '5.22.0'
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    // Authentication is tested separately; this harness fixes the caller as A.
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-a', organizationId: 'org-a', role: 'owner' };
      next();
    });
    app.use('/dashboards', router);
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/dashboards`;
  });
  afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    rows = [
      { id: 'own', dashboardId: dashboard.id, organizationId: 'org-a' },
      { id: 'other-dashboard', dashboardId: 'dashboard-a2', organizationId: 'org-a' },
      { id: 'foreign', dashboardId: 'dashboard-b', organizationId: 'org-b' },
      { id: 'inconsistent-tenant', dashboardId: dashboard.id, organizationId: 'org-b' }
    ].map(row => ({ ...row, name: 'original', type: 'metric', config: { marker: row.id } }));
    mockDb.dashboard.findFirst.mockImplementation(async ({ where }) => matches(dashboard, where) ? dashboard : null);
    mockDb.widget.findUnique.mockImplementation(async ({ where }) => rows.find(row => matches(row, where)) || null);
    mockDb.widget.update.mockImplementation(async ({ where, data }) => {
      const row = rows.find(row => matches(row, where));
      if (!row) throw missing();
      Object.assign(row, data);
      return row;
    });
    mockDb.widget.delete.mockImplementation(async ({ where }) => {
      const index = rows.findIndex(row => matches(row, where));
      if (index === -1) throw missing();
      return rows.splice(index, 1)[0];
    });
    mockDb.analyticsEvent.count.mockResolvedValue(7);
  });
  afterEach(() => jest.restoreAllMocks());

  async function request(method: string, widget: string, dashboardId = dashboard.id) {
    return fetch(`${base}/${dashboardId}/widgets/${widget}${method === 'GET' ? '/data' : ''}`, {
      method, signal: AbortSignal.timeout(5000), headers: { 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify({ name: 'updated', organizationId: 'org-b', dashboardId: 'dashboard-b' }) } : {})
    });
  }

  describe.each(['GET', 'PUT', 'DELETE'])('%s', method => {
    it.each(['other-dashboard', 'foreign', 'inconsistent-tenant', 'missing'])('rejects %s without disclosure or mutation', async id => {
      const before = JSON.stringify(rows);
      const response = await request(method, id);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Widget not found' });
      expect(JSON.stringify(rows)).toBe(before);
      expect(mockDb.analyticsEvent.count).not.toHaveBeenCalled();
      expect(mockDb.analyticsEvent.groupBy).not.toHaveBeenCalled();
      expect(mockDb.analyticsEvent.findMany).not.toHaveBeenCalled();
    });

    it('rejects a foreign dashboard before accessing widgets', async () => {
      const response = await request(method, 'foreign', 'dashboard-b');
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Dashboard not found' });
      for (const operation of Object.values(mockDb.widget)) expect(operation).not.toHaveBeenCalled();
    });

    it('preserves successful access to the owned widget', async () => {
      const response = await request(method, 'own');
      expect(response.status).toBe(200);
      const body: any = await response.json();
      if (method === 'GET') {
        expect(body.widget.id).toBe('own');
        expect(body.data).toBe(7);
        expect(mockDb.analyticsEvent.count).toHaveBeenCalledWith({ where: { organizationId: 'org-a' } });
      } else if (method === 'PUT') {
        expect(body).toMatchObject({ name: 'updated', organizationId: 'org-a', dashboardId: dashboard.id });
      } else {
        expect(body).toEqual({ message: 'Widget deleted' });
        expect(rows.some(row => row.id === 'own')).toBe(false);
      }
    });

    it('keeps unexpected database errors as 500', async () => {
      const operation = method === 'GET' ? 'findUnique' : method === 'PUT' ? 'update' : 'delete';
      mockDb.widget[operation].mockRejectedValue(new Error('database unavailable'));
      const response = await request(method, 'own');
      expect(response.status).toBe(500);
      await response.json();
    });
  });
});
