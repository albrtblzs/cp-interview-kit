// Run via stdin inside the development backend: node - --before (or --after).
const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const db = new PrismaClient();
const organizationId = randomUUID();
const mode = process.argv.includes('--after') ? 'after' : 'before';
async function main() {
  try {
    await db.organization.create({ data: { id: organizationId, name: 'Loading benchmark', slug: `loading-${organizationId}` } });
    const user = await db.user.create({ data: {
      email: `${organizationId}@example.invalid`, name: 'Benchmark', passwordHash: randomUUID(), organizationId
    } });
    await db.analyticsEvent.createMany({ data: Array.from({ length: 120 }, (_, index) => ({
      organizationId, eventType: 'demo', eventName: `event-${index}`
    })) });
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'super-secret-key-change-in-production');
    async function get(path) {
      const response = await fetch(`http://localhost:3001/api/dashboards/${path}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
      return response.json();
    }
    const results = [];
    for (const count of [1, 10, 30]) {
      const dashboard = await db.dashboard.create({ data: {
        name: `${count} metric widgets`, organizationId, createdById: user.id,
        widgets: { create: Array.from({ length: count }, (_, index) => ({
          name: `Metric ${index}`, type: 'metric', organizationId
        })) }
      } });
      const start = performance.now();
      let values;
      if (mode === 'before') {
        const loaded = await get(dashboard.id);
        values = await Promise.all(loaded.widgets.map(widget => get(`${dashboard.id}/widgets/${widget.id}/data`)));
      } else {
        const loaded = await get(`${dashboard.id}/data`);
        values = loaded.widgetData;
      }
      if (values.length !== count || values.some(value => value.data !== 120)) throw new Error('Incorrect widget results');
      results.push({ widgets: count, requests: mode === 'before' ? count + 1 : 1, elapsedMs: Math.round(performance.now() - start) });
    }
    console.log(JSON.stringify({ mode, results }, null, 2));
  } finally {
    await db.$transaction([
      db.widget.deleteMany({ where: { organizationId } }),
      db.dashboard.deleteMany({ where: { organizationId } }),
      db.analyticsEvent.deleteMany({ where: { organizationId } }),
      db.user.deleteMany({ where: { organizationId } }),
      db.organization.deleteMany({ where: { id: organizationId } })
    ]);
    console.log('Disposable benchmark records removed.');
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
