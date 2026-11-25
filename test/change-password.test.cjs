require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { SessionService } = require('../src/session/session.service');
const { SessionAuthGuard } = require('../src/auth/guards/session-auth.guard');
const { RolesGuard } = require('../src/auth/guards/roles.guard');
const { PrivilegeFieldsPipe } = require('../src/auth/privilege-fields.pipe');
const status = n => error => error.getStatus?.() === n;
async function fixture() {
  const state = { user: { id: 'admin', role: 'ADMIN', passwordHash: await bcrypt.hash('old-password', 4) }, sessions: [
    { id: 'current', userId: 'admin', isValid: true },
    { id: 'other', userId: 'admin', isValid: true },
    { id: 'someone-else', userId: 'someone-else', isValid: true },
  ] };
  let writes = 0;
  const db = { user: { findUnique: async () => ({ ...state.user }) }, $transaction: async action => {
    const next = structuredClone(state);
    const tx = {
      user: { updateMany: async ({ where, data }) => {
        writes++;
        if (where.id !== next.user.id || where.role !== next.user.role || where.passwordHash !== next.user.passwordHash) return { count: 0 };
        Object.assign(next.user, data); return { count: 1 };
      } },
      session: { updateMany: async ({ where, data }) => {
        if (db.failRevoke) throw new Error('Revocation failed');
        const selected = next.sessions.filter(s => s.userId === where.userId && s.id !== where.id.not && s.isValid);
        selected.forEach(s => Object.assign(s, data)); return { count: selected.length };
      } },
    };
    const result = await action(tx); Object.assign(state, next); return result;
  } };
  const service = new AuthService(db, {}, {});
  return { state, db, service, writes: () => writes };
}
test('Password change hashes new password, preserves current/other-user sessions, revokes own other sessions', async () => {
  const { state, service } = await fixture();
  const result = await service.changePassword('admin', 'current', 'old-password', 'new-password');
  assert.equal(await bcrypt.compare('new-password', state.user.passwordHash), true);
  assert.equal(await bcrypt.compare('old-password', state.user.passwordHash), false);
  assert.equal(state.sessions[0].isValid, true);
  assert.equal(state.sessions[1].isValid, false);
  assert.equal(state.sessions[1].revokedReason, 'PASSWORD_CHANGED');
  assert.equal(state.sessions[2].isValid, true);
  assert.deepEqual(Object.keys(result).sort(), ['message', 'success']);
});
for (const [current, next] of [['wrong','new-password'],['old-password','old-password'],['old-password','short'],['old-password','é'.repeat(37)]]) {
  test(`Password change rejects invalid credentials/password (${next.length} characters) without writes`, async () => {
    const f = await fixture();
    await assert.rejects(f.service.changePassword('admin','current',current,next), status(400));
    assert.equal(f.writes(), 0);
  });
}
test('Password change rolls back password when session revocation fails', async () => {
  const f = await fixture(); const original = f.state.user.passwordHash; f.db.failRevoke = true;
  await assert.rejects(f.service.changePassword('admin','current','old-password','new-password'));
  assert.equal(f.state.user.passwordHash, original);
});
test('Password change rejects concurrent replacement and non-admin account', async () => {
  const f = await fixture();
  f.db.$transaction = async fn => fn({ user: { updateMany: async () => ({ count: 0 }) }, session: { updateMany: () => assert.fail('must not revoke') } });
  await assert.rejects(f.service.changePassword('admin','current','old-password','new-password'), status(409));
  f.state.user.role = 'CUSTOMER';
  await assert.rejects(f.service.changePassword('admin','current','old-password','new-password'), status(403));
});
test('HTTP password change requires ADMIN, validates body, derives identity from session and changes only own password', async () => {
  const f = await fixture();
  class PasswordTestModule {}
  Module({ controllers: [AuthController], providers: [SessionAuthGuard, RolesGuard,
    { provide: AuthService, useValue: f.service },
    { provide: SessionService, useValue: { validateSession: async token => ['admin','customer'].includes(token) ? {
      id: 'current', isValid: true, expiresAt: new Date(Date.now()+60000), user: { id: token, role: token === 'admin' ? 'ADMIN' : 'CUSTOMER' },
    } : null } },
  ] })(PasswordTestModule);
  const app = await NestFactory.create(PasswordTestModule, { logger: false });
  app.useGlobalPipes(new PrivilegeFieldsPipe(), new ValidationPipe({ transform: true }));
  await app.listen(0, '127.0.0.1');
  try {
    const send = (token, body = { currentPassword: 'old-password', newPassword: 'new-password' }) => fetch(`${app.getHttpServer().address().address ? 'http://127.0.0.1' : ''}:${app.getHttpServer().address().port}/auth/change-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await send(null)).status, 401);
    assert.equal((await send('invalid')).status, 401);
    assert.equal((await send('customer')).status, 403);
    assert.equal((await send('admin', { currentPassword: 'old-password', newPassword: 'new-password', userId: 'someone-else' })).status, 400);
    assert.equal((await send('admin', { currentPassword: 'old-password', newPassword: 'short' })).status, 400);
    assert.equal((await send('admin', { currentPassword: 'wrong', newPassword: 'new-password' })).status, 400);
    assert.equal(f.writes(), 0);
    const response = await send('admin'); assert.equal(response.status, 201);
    assert.equal((await response.json()).success, true);
  } finally { await app.close(); }
});
