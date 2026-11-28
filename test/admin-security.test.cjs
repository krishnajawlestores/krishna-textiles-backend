require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { of, throwError, lastValueFrom } = require('rxjs');
const { AdminSecurityService } = require('../src/admin-security/admin-security.service');
const { AdminSecurityController } = require('../src/admin-security/admin-security.controller');
const { ActivityInterceptor } = require('../src/admin-security/activity.interceptor');
const { SessionService } = require('../src/session/session.service');

test('activity pagination uses the same user scope and stable ordering for count and rows', async () => {
  let countQuery, rowsQuery;
  const service = new AdminSecurityService({ adminActivity: {
    count: async q => { countQuery = q; return 45; },
    findMany: async q => { rowsQuery = q; return []; },
  } });
  const result = await service.activity({ userId: 'admin-1', page: 99, limit: 20 });
  assert.equal(result.page, 3); assert.equal(result.total, 45);
  assert.deepEqual(rowsQuery.where, countQuery.where);
  assert.deepEqual(rowsQuery.where, { userId: 'admin-1' });
  assert.equal(rowsQuery.skip, 40); assert.equal(rowsQuery.take, 20);
  assert.deepEqual(rowsQuery.orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
});

test('session listing filters active unexpired admins and never selects tokens', async () => {
  let query;
  const service = new AdminSecurityService({ session: {
    count: async () => 1,
    findMany: async q => { query = q; return [{ id: 'current' }]; },
  } });
  const result = await service.sessions({ page: 1, limit: 20, userId: 'admin-2' }, 'current');
  assert.equal(query.where.user.role, 'ADMIN'); assert.equal(query.where.isValid, true);
  assert.equal(query.where.userId, 'admin-2'); assert.ok(query.where.expiresAt.gt instanceof Date);
  assert.equal(query.select.token, undefined); assert.equal(query.select.user.select.passwordHash, undefined);
  assert.equal(result.data[0].isCurrent, true);
});

test('session revocation protects current session, scopes writes to admins and preserves history', async () => {
  const writes = [];
  const service = new AdminSecurityService({
    session: { updateMany: async q => { writes.push(q); return { count: 1 }; } },
    user: { findFirst: async () => ({ id: 'admin-2' }) },
  });
  await assert.rejects(service.revoke('current', 'current'), e => e.getStatus() === 400);
  assert.equal(writes.length, 0);
  await service.revoke('other', 'current');
  assert.equal(writes[0].where.user.role, 'ADMIN'); assert.equal(writes[0].data.isValid, false);
  await service.logoutUser('admin-2', 'current');
  assert.equal(writes[1].where.userId, 'admin-2'); assert.deepEqual(writes[1].where.id, { not: 'current' });
  assert.equal(writes[1].where.user.role, 'ADMIN');
});

test('audit records admin identity and success/failure metadata without secrets', async () => {
  const rows = [];
  const interceptor = new ActivityInterceptor({ adminActivity: { create: async q => rows.push(q.data) } });
  const req = { user: { id: 'a', name: 'Developer', email: 'dev@example.test', role: 'ADMIN' }, method: 'PUT', path: '/api/products/p1', headers: {}, body: { password: 'secret', token: 'secret' } };
  const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 200 }) }) };
  await lastValueFrom(await interceptor.intercept(ctx, { handle: () => of({ passwordHash: 'secret' }) }));
  assert.deepEqual(rows[0], { userId: 'a', userName: 'Developer', userEmail: 'dev@example.test', action: 'PUT', path: '/api/products/p1', statusCode: 200 });
  await assert.rejects(lastValueFrom(await interceptor.intercept(ctx, { handle: () => throwError(() => ({ getStatus: () => 409 })) })));
  assert.equal(rows[1].statusCode, 409);
  req.user.role = 'CUSTOMER';
  await lastValueFrom(await interceptor.intercept(ctx, { handle: () => of({}) }));
  assert.equal(rows.length, 2);
});

let app, base, writes = 0;
before(async () => {
  class TestModule {}
  Module({ controllers: [AdminSecurityController], providers: [
    { provide: AdminSecurityService, useValue: {
      users: () => [], activity: () => ({ data: [], total: 0 }), sessions: () => ({ data: [], total: 0 }),
      revoke: () => { writes++; return { success: true }; }, logoutUser: () => { writes++; return { success: true }; },
    } },
    { provide: SessionService, useValue: { validateSession: async token => ['admin', 'customer'].includes(token) ? { id: 'current', isValid: true, expiresAt: new Date(Date.now() + 60000), user: { id: token, role: token.toUpperCase() } } : null } },
  ] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false });
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => app?.close());
test('all security routes require admin authentication; invalid filters are rejected', async () => {
  for (const [method, path] of [['GET', 'users'], ['GET', 'activity'], ['GET', 'sessions'], ['PATCH', 'sessions/other/revoke'], ['PATCH', 'users/other/logout'], ['POST', 'page-view']]) {
    for (const [token, expected] of [[undefined, 401], ['customer', 403]]) {
      const response = await fetch(`${base}/admin-security/${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, expected);
    }
  }
  assert.equal(writes, 0);
  const headers = { Authorization: 'Bearer admin', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/admin-security/activity?limit=1000`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/admin-security/activity?page=0`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/admin-security/activity?userId=admin`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/admin-security/sessions/other/revoke`, { method: 'PATCH', headers })).status, 200);
  assert.equal(writes, 1);
});
