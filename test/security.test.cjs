require('reflect-metadata');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory, Reflector } = require('@nestjs/core');
const { SessionAuthGuard } = require('../src/auth/guards/session-auth.guard');
const { RolesGuard } = require('../src/auth/guards/roles.guard');
const { SessionService } = require('../src/session/session.service');
const { SessionController } = require('../src/session/session.controller');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { ProductsService } = require('../src/products/products.service');
const { ProductsController } = require('../src/products/products.controller');
const { CategoriesService } = require('../src/categories/categories.service');
const { BrandsService } = require('../src/brands/brands.service');
const { CustomCacheService } = require('../src/cache/custom-cache.service');
const { PrivilegeFieldsPipe } = require('../src/auth/privilege-fields.pipe');
const bcrypt = require('bcryptjs');
const ctx = (authorization) => ({ switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }) });
const status = n => err => err.getStatus?.() === n;
const user = { id: 'customer-1', role: 'CUSTOMER', email: 'customer@example.test' };
const admin = { id: 'admin-1', role: 'ADMIN', email: 'admin@example.test' };
const session = actor => ({ id: actor.id + '-session', userId: actor.id, user: actor, token: actor.role.toLowerCase(), isValid: true, expiresAt: new Date(Date.now() + 60000) });

for (const header of [undefined, '', 'Bearer', 'Bearer ', 'Bearer  abc', 'Bearer abc ', 'Bearer abc extra', 'Basic abc', ['Bearer abc'], 'Bearer\tabc']) {
  test(`AUTH malformed header ${JSON.stringify(header)} fails before database lookup`, async () => {
    const guard = new SessionAuthGuard({ validateSession: () => assert.fail('must not validate malformed input') });
    await assert.rejects(guard.canActivate(ctx(header)), status(401));
  });
}
for (const outcome of [null, { ...session(user), isValid: false }, { ...session(user), expiresAt: new Date(0) }, new Error('database unavailable')]) {
  test(`AUTH invalid/revoked/expired/database failure fails closed: ${outcome?.message || outcome?.isValid}`, async () => {
    const guard = new SessionAuthGuard({ validateSession: async () => { if (outcome instanceof Error) throw outcome; return outcome; } });
    await assert.rejects(guard.canActivate(ctx('Bearer token')), status(401));
  });
}
for (const state of ['unknown', 'revoked', 'expired', 'valid']) {
  test(`SessionService validates stored ${state} sessions`, async () => {
    const row = state === 'unknown' ? null : { ...session(user), isValid: state !== 'revoked', expiresAt: state === 'expired' ? new Date(0) : new Date(Date.now() + 60000) };
    const service = new SessionService({ session: { findUnique: async () => row, update: async () => ({}) } });
    assert.equal(Boolean(await service.validateSession('opaque-token')), state === 'valid');
  });
}

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'AND') return value.every(w => matches(row, w));
    if (key === 'OR') return value.some(w => matches(row, w));
    if (key === 'NOT') return !matches(row, value);
    if (value && typeof value === 'object') {
      if ('equals' in value) return String(row[key]).toLowerCase() === String(value.equals).toLowerCase();
      if ('in' in value) return value.in.some(v => String(v).toLowerCase() === String(row[key]).toLowerCase());
      if ('contains' in value) return String(row[key]).toLowerCase().includes(value.contains.toLowerCase());
      return row[key] != null && matches(row[key], value);
    }
    return row[key] === value;
  });
}
function catalogueFixture() {
  const rows = {
    product: [{ id: 'p1', slug: 'shirt', sku: 'SKU1', name: 'Shirt', category: 'shirts', brand: 'Mill', brandId: 'mill', categoryId: 'c1', brandRefId: 'b1', isActive: true }],
    category: [{ id: 'c1', name: 'Shirts', slug: 'shirts', isActive: true }],
    brand: [{ id: 'b1', name: 'Mill', slug: 'mill', isActive: true }],
  };
  const db = {};
  const expand = (model, row) => model === 'product' ? { ...row, categoryRef: rows.category.find(c => c.id === row.categoryId) || null, brandRef: rows.brand.find(b => b.id === row.brandRefId) || null } : row;
  let deleted = false;
  for (const model of Object.keys(rows)) {
    db[model] = {
      findUnique: async ({ where }) => rows[model].find(r => matches(r, where)) || null,
      findFirst: async ({ where }) => rows[model].map(r => expand(model, r)).find(r => matches(r, where)) || null,
      findMany: async ({ where } = {}) => rows[model].map(r => expand(model, r)).filter(r => matches(r, where)),
      count: async ({ where }) => rows[model].map(r => expand(model, r)).filter(r => matches(r, where)).length,
      update: async ({ where, data }) => { const row = rows[model].find(r => matches(r, where)); Object.assign(row, data); return { ...row }; },
      create: async ({ data }) => { const row = { id: 'new', isActive: true, ...data }; rows[model].push(row); return row; },
      delete: async () => { deleted = true; assert.fail('Hard deletion is forbidden'); },
    };
  }
  db.$transaction = async (fn, opts) => { assert.equal(opts.isolationLevel, 'Serializable'); return fn(db); };
  const cache = new CustomCacheService();
  return { rows, db, cache, products: new ProductsService(db, cache), categories: new CategoriesService(db, cache), brands: new BrandsService(db, cache), wasDeleted: () => deleted };
}

test('T07-T11 product archive/restore hides all aliases, clears caches, preserves record', async () => {
  const f = catalogueFixture();
  for (const key of ['products:p1', 'products:shirt', 'products:SKU1', 'categories:list', 'brands:list']) await f.cache.set(key, { stale: true });
  await f.products.remove('p1');
  assert.equal(f.rows.product.length, 1);
  assert.equal(f.rows.product[0].isActive, false);
  assert.equal(f.wasDeleted(), false);
  for (const key of ['products:p1', 'products:shirt', 'products:SKU1', 'categories:list', 'brands:list']) assert.equal(await f.cache.get(key), null);
  for (const id of ['p1', 'shirt', 'SKU1']) await assert.rejects(f.products.findOne(id), status(404));
  assert.equal((await f.products.findAll({ search: 'Shirt' })).total, 0);
  assert.equal((await f.products.findAll({ isActive: false }, true)).total, 1);
  await f.products.restore('p1');
  assert.equal((await f.products.findOne('shirt')).isActive, true);
  assert.equal((await f.products.findAll({})).total, 1);
});
for (const name of ['categories', 'brands']) {
  test(`T10 ${name} rejects archive and PUT bypass with active dependencies`, async () => {
    const f = catalogueFixture(), id = name === 'categories' ? 'c1' : 'b1';
    await f.cache.set('products:p1', 'unchanged');
    await assert.rejects(f[name].remove(id), status(409));
    await assert.rejects(f[name].update(id, { isActive: false }), status(409));
    assert.equal(await f.cache.get('products:p1'), 'unchanged');
    await f.products.remove('p1');
    await f[name].remove(id);
    await assert.rejects(f[name].findOne(id), status(404));
    assert.equal((await f[name].findAll()).length, 0);
    assert.equal((await f[name].findAll(true, false)).length, 1);
    await assert.rejects(f.products.restore('p1'), status(409));
    await f[name].restore(id);
    await f.products.restore('p1');
    assert.equal((await f.products.findOne('p1')).isActive, true);
  });
}
test('Inactive relations hide products and filtered counts use public visibility', async () => {
  const f = catalogueFixture(); f.rows.category[0].isActive = false;
  assert.equal((await f.products.findAll({})).total, 0);
  await assert.rejects(f.products.findOne('p1'), status(404));
  let query;
  f.db.brand.findMany = async args => { query = args; return []; };
  await f.products.getBrands();
  assert.equal(query.where.isActive, true);
  assert.equal(query.include._count.select.products.where.AND[0].isActive, true);
});
test('Failed transaction never invalidates cache; conflicts are 409', async () => {
  const f = catalogueFixture(); await f.cache.set('products:p1', 'keep');
  f.db.$transaction = async () => { throw { code: 'P2034' }; };
  await assert.rejects(f.products.remove('p1'), status(409));
  assert.equal(await f.cache.get('products:p1'), 'keep');
});
test('Catalogue rejects nested Prisma writes, invalid active flags, missing restore IDs', async () => {
  const f = catalogueFixture();
  for (const body of [{ categoryRef: { delete: true } }, { isActive: 'false' }, { role: 'ADMIN' }, { stock: -1 }]) await assert.rejects(f.products.update('p1', body), status(400));
  await assert.rejects(f.products.restore('missing'), status(404));
  await assert.rejects(f.categories.restore('missing'), status(404));
  await assert.rejects(f.brands.restore('missing'), status(404));
});

test('T05 service ignores ADMIN role; T12 legitimate login creates session', async () => {
  let saved, createdSession;
  const prisma = { user: {
    findUnique: async () => null,
    create: async ({ data }) => { saved = { id: 'new-user', ...data }; return saved; },
  } };
  const service = new AuthService(prisma, { sign: () => 'signed-token' }, { createSession: async args => { createdSession = args; return { id: 's1' }; } });
  const registered = await service.register({ email: 'new@example.test', password: 'valid-password', name: 'Buyer', role: 'ADMIN' });
  assert.equal(saved.role, 'CUSTOMER'); assert.equal(registered.user.role, 'CUSTOMER');
  assert.notEqual(saved.passwordHash, 'valid-password');
  prisma.user.findUnique = async () => saved;
  const login = await service.login(' NEW@example.test ', 'valid-password', {});
  assert.equal(login.accessToken, 'signed-token'); assert.equal(createdSession.userId, saved.id);
  await assert.rejects(service.login('new@example.test', 'wrong', {}), status(401));
});
test('Session ownership checks prevent revoking another user before mutation', async () => {
  const service = new SessionService({ session: { findUnique: async () => ({ userId: 'other' }), update: () => assert.fail('unauthorized write') } });
  await assert.rejects(service.revokeSession('other-session', 'test', user), status(403));
});
test('Session stats and audit history apply user scope in every query', async () => {
  const queries = [];
  const service = new SessionService({ session: { count: async q => { queries.push(q); return 1; }, groupBy: async q => { queries.push(q); return []; }, findMany: async q => { queries.push(q); return []; } } });
  await service.getSessionStats(user.id); await service.getAllSessions(user.id);
  assert.equal(queries.length, 5); queries.forEach(q => assert.equal(q.where.userId, user.id));
});

let app, base, httpFixture, scopes = [], mutations = 0;
before(async () => {
  httpFixture = catalogueFixture();
  const sessionService = {
    validateSession: async token => token === 'admin' ? session(admin) : token === 'customer' ? session(user) : null,
    getActiveSessions: async id => { scopes.push(id); return [session(user)]; },
    getAllSessions: async id => { scopes.push(id); return [session(user)]; },
    getSessionStats: async id => { scopes.push(id); return { activeSessions: 1 }; },
    revokeOtherSessions: async (id, token) => { scopes.push([id, token]); return { count: 1 }; },
    revokeAllUserSessions: async id => { scopes.push(id); return { count: 1 }; },
    revokeSession: async () => ({ ...session(user), isValid: false }),
  };
  const { SettingsController } = require('../src/settings/settings.controller');
  const { SettingsService } = require('../src/settings/settings.service');
  class TestModule {}
  Module({ controllers: [ProductsController, SessionController, AuthController, SettingsController], providers: [
    SessionAuthGuard, RolesGuard,
    { provide: SessionService, useValue: sessionService },
    { provide: ProductsService, useValue: httpFixture.products },
    { provide: AuthService, useValue: { register: () => { mutations++; return { ok: true }; } } },
    { provide: SettingsService, useValue: { updateSettings: () => { mutations++; return { ok: true }; }, getSettings: () => ({}) } },
  ] })(TestModule);
  app = await NestFactory.create(TestModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new PrivilegeFieldsPipe(), new ValidationPipe({ transform: true }));
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
after(async () => { await app?.close(); });
async function request(path, method = 'GET', token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
test('T01-T04 HTTP guard order: 401/403 never mutates; ADMIN succeeds', async () => {
  mutations = 0;
  assert.equal((await request('/settings', 'PUT', undefined, {})).status, 401);
  assert.equal((await request('/settings', 'PUT', 'invalid', {})).status, 401);
  assert.equal((await request('/settings', 'PUT', 'customer', {})).status, 403);
  assert.equal(mutations, 0);
  assert.equal((await request('/settings', 'PUT', 'admin', {})).status, 200);
  assert.equal(mutations, 1);
});
test('T05 HTTP registration rejects privilege input before service execution', async () => {
  const beforeCount = mutations;
  const res = await request('/auth/register', 'POST', undefined, { name: 'Buyer', email: 'buyer@example.test', password: 'valid-password', role: 'ADMIN' });
  assert.equal(res.status, 400); assert.equal(mutations, beforeCount);
});
test('T06 HTTP session endpoints require authentication and scope customer requests', async () => {
  for (const route of ['active', 'all', 'stats']) {
    assert.equal((await request(`/session/${route}`)).status, 401);
    assert.equal((await request(`/session/${route}?userId=other`, 'GET', 'customer')).status, 403);
    const res = await request(`/session/${route}`, 'GET', 'customer');
    assert.equal(res.status, 200); assert.equal(scopes.at(-1), user.id);
    assert.equal(JSON.stringify(await res.json()).includes('"token"'), false);
  }
  assert.equal((await request('/session/active?userId=other', 'GET', 'admin')).status, 200);
  assert.equal(scopes.at(-1), 'other');
  assert.equal((await request('/session/revoke-others', 'POST', 'customer', { userId: 'other', currentToken: 'forged' })).status, 403);
  assert.equal((await request('/session/revoke-others', 'POST', 'customer', {})).status, 201);
  assert.deepEqual(scopes.at(-1), [user.id, 'customer']);
  assert.equal((await request('/session/revoke-all', 'POST', 'customer', { userId: 'other' })).status, 403);
  assert.equal((await request('/session/revoke-all', 'POST', 'customer', {})).status, 201);
  assert.equal(scopes.at(-1), user.id);
});
test('T07-T09 HTTP catalogue archive/admin visibility/restore lifecycle', async () => {
  assert.equal((await request('/products/p1', 'DELETE', 'customer')).status, 403);
  assert.equal((await request('/products/p1', 'DELETE', 'admin')).status, 200);
  assert.equal((await request('/products/p1')).status, 404);
  assert.equal((await request('/products/admin?isActive=false', 'GET', 'customer')).status, 403);
  const res = await request('/products/admin?isActive=false', 'GET', 'admin');
  assert.equal(res.status, 200); assert.equal((await res.json()).total, 1);
  assert.equal((await request('/products/p1/restore', 'POST', 'admin')).status, 201);
  assert.equal((await request('/products/p1')).status, 200);
});

// Inspect real route metadata to cover every administrative controller, not a test-only guard.
test('Administrative route inventory attaches authentication before role authorization', () => {
  const modules = ['products','categories','brands','coupons','offers','cms','settings','orders','inventory','crm','analytics','cache','upload'];
  const fullAdmin = new Set(['inventory','crm','analytics','cache','upload']);
  const publicPosts = new Set(['orders:create', 'orders:createRazorpayOrder', 'orders:verifyRazorpayPayment', 'coupons:validate']);
  let checked = 0;
  for (const name of modules) {
    const exports = require(`../src/${name}/${name}.controller`);
    const Controller = Object.values(exports).find(v => typeof v === 'function' && v.name.endsWith('Controller'));
    for (const key of Object.getOwnPropertyNames(Controller.prototype)) {
      const fn = Controller.prototype[key];
      const method = Reflect.getMetadata('method', fn);
      if (method === undefined) continue;
      const path = Reflect.getMetadata('path', fn);
      const administrative = fullAdmin.has(name) || String(path).startsWith('admin') || (method !== 0 && !publicPosts.has(`${name}:${key}`)) || (name === 'coupons' && method === 0);
      if (!administrative) continue;
      const guards = [...(Reflect.getMetadata('__guards__', Controller) || []), ...(Reflect.getMetadata('__guards__', fn) || [])];
      const roles = Reflect.getMetadata('roles', fn) || Reflect.getMetadata('roles', Controller);
      assert(guards.some(g => ['SessionAuthGuard','JwtAuthGuard'].includes(g.name)), `${name}.${key} authentication`);
      assert(guards.includes(RolesGuard), `${name}.${key} authorization`);
      assert(guards.findIndex(g => ['SessionAuthGuard','JwtAuthGuard'].includes(g.name)) < guards.indexOf(RolesGuard));
      assert.deepEqual(roles, ['ADMIN'], `${name}.${key} roles`);
      checked++;
    }
  }
  assert(checked >= 50);
});

test('Legacy text-only catalogue relationships cannot bypass archive or restore checks', async () => {
  const f = catalogueFixture();
  f.rows.product[0].categoryId = null; f.rows.product[0].brandRefId = null;
  await assert.rejects(f.categories.remove('c1'), status(409));
  await assert.rejects(f.brands.remove('b1'), status(409));
  f.rows.category[0].isActive = false;
  assert.equal((await f.products.findAll({})).total, 0);
  await assert.rejects(f.products.restore('p1'), status(409));
  f.rows.category[0].isActive = true; f.rows.brand[0].isActive = false;
  assert.equal((await f.products.findAll({})).total, 0);
  await assert.rejects(f.products.restore('p1'), status(409));
});
test('Create and reassign cannot attach active products to archived dependencies', async () => {
  const f = catalogueFixture(); f.rows.category[0].isActive = false;
  await assert.rejects(f.products.create({ name: 'New', category: 'shirts', categoryId: 'c1', price: 10, mrp: 20 }), status(409));
  await assert.rejects(f.products.update('p1', { categoryId: 'c1' }), status(409));
  await f.products.remove('p1');
  await f.products.update('p1', { name: 'Archived item' });
  assert.equal(f.rows.product[0].name, 'Archived item');
});
test('Orders scope list/detail/invoice to authenticated email and redact nested admin records', async () => {
  const { OrdersService } = require('../src/orders/orders.service');
  let listQuery;
  const row = { id: 'order1', customerEmail: user.email, customer: { creditLimit: 500 }, razorpaySignature: 'secret', paymentNotes: 'private', items: [{ productName: 'Snapshot', product: { id: 'archived', isActive: false } }] };
  const service = new OrdersService({ order: {
    findFirst: async () => row,
    count: async () => 1,
    findMany: async q => { listQuery = q; return [row]; },
  } }, {}, { getSettings: async () => ({}) });
  await assert.rejects(service.findAll({ customerEmail: 'other@example.test' }, user), status(403));
  const result = await service.findAll({ customerPhone: 'someone-else' }, user);
  assert.equal(listQuery.where.AND[0].customerEmail.equals, user.email);
  assert.equal(result.orders[0].customer, undefined);
  assert.equal(result.orders[0].razorpaySignature, undefined);
  assert.equal(result.orders[0].items[0].product, null);
  assert.equal((await service.getInvoiceData('order1', user)).order.id, 'order1');
  await assert.rejects(service.findOne('order1', { ...user, email: 'other@example.test' }), status(403));
  assert.equal((await service.findOne('order1', admin)).customer.creditLimit, 500);
});
test('Checkout DTO rejects paid status and nested privilege injection while accepting current storefront payload', async () => {
  const { CreateOrderDto } = require('../src/orders/order.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = { customerName: 'Buyer', customerPhone: '1234567890', customerEmail: user.email, shippingAddress: 'Test address', paymentMethod: 'PAY_AFTER_CONTACT', paymentStatus: 'UNPAID', items: [{ productId: 'p1', productName: 'Shirt', quantity: 1, unitPrice: 3000 }] };
  const meta = { type: 'body', metatype: CreateOrderDto };
  assert.equal((await pipe.transform(body, meta)).paymentStatus, 'UNPAID');
  await assert.rejects(pipe.transform({ ...body, paymentStatus: 'PAID' }, meta), status(400));
  await assert.rejects(pipe.transform({ ...body, customerId: 'other' }, meta), status(400));
  await assert.rejects(pipe.transform({ ...body, items: [{ ...body.items[0], quantity: -1 }] }, meta), status(400));
  assert.throws(() => new PrivilegeFieldsPipe().transform({ nested: { role: 'ADMIN' } }, meta), status(400));
});
test('CMS public reads hide drafts; admin reads retain visibility without touching CMS file', async () => {
  const { CmsService } = require('../src/cms/cms.service');
  const cms = Object.create(CmsService.prototype); // Avoid constructor file IO.
  cms.banners = [{ id: 'hidden', isActive: false }, { id: 'visible', isActive: true }];
  cms.pages = [{ id: 'draft', slug: 'draft', isPublished: false }, { id: 'live', slug: 'live', isPublished: true }];
  cms.announcement = { isActive: false };
  assert.equal((await cms.getAllBanners()).length, 1);
  assert.equal((await cms.getAllBanners(true)).length, 2);
  await assert.rejects(cms.getBanner('hidden'), status(404));
  assert.equal((await cms.getAllPages()).length, 1);
  await assert.rejects(cms.getPageBySlug('draft'), status(404));
  assert.equal((await cms.getAllPages(true)).length, 2);
  assert.equal(await cms.getAnnouncement(), null);
});
test('Offers public isActive query cannot reveal inactive records; admin can view them', async () => {
  const { OffersService } = require('../src/offers/offers.service');
  let query;
  const service = new OffersService({ offer: { findMany: async q => { query = q; return []; }, findFirst: async q => { query = q; return null; } } });
  await service.findAll({ isActive: 'false' }); assert.equal(query.where.isActive, true);
  await service.findAll({ isActive: 'false' }, true); assert.equal(query.where.isActive, false);
  await assert.rejects(service.findOne('hidden'), status(404)); assert.equal(query.where.isActive, true);
});

test('Logout revokes the authenticated session and does not reparse header casing', async () => {
  let token;
  const controller = new AuthController({ logout: async value => { token = value; return { success: true }; } });
  assert.equal((await controller.logout({ session: { token: 'current-token' }, headers: { authorization: 'bearer current-token' } })).success, true);
  assert.equal(token, 'current-token');
});

test('Administrative order DTOs reject invalid enums, dates and unexpected fields', async () => {
  const { UpdateOrderStatusDto, UpdatePaymentDto } = require('../src/orders/order.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  await assert.rejects(pipe.transform({ status: 'INVALID' }, { type: 'body', metatype: UpdateOrderStatusDto }), status(400));
  await assert.rejects(pipe.transform({ status: 'DISPATCHED', dispatchedAt: 'yesterday' }, { type: 'body', metatype: UpdateOrderStatusDto }), status(400));
  await assert.rejects(pipe.transform({ paymentStatus: 'PAID', userId: 'forged' }, { type: 'body', metatype: UpdatePaymentDto }), status(400));
  assert.equal((await pipe.transform({ paymentStatus: 'PAID' }, { type: 'body', metatype: UpdatePaymentDto })).paymentStatus, 'PAID');
});
