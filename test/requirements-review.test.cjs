require('reflect-metadata');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { Prisma } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { SessionService } = require('../src/session/session.service');
const { SessionController } = require('../src/session/session.controller');
const { SessionAuthGuard } = require('../src/auth/guards/session-auth.guard');
const { RolesGuard } = require('../src/auth/guards/roles.guard');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { PrivilegeFieldsPipe } = require('../src/auth/privilege-fields.pipe');
const { PersistenceExceptionFilter } = require('../src/common/persistence-exception.filter');
const { validateFields, productFields } = require('../src/catalogue/validation');
const dto = require('../src/common/admin.dto');
const status = n => e => e.getStatus?.() === n;
const buyer = { id: 'buyer', name: 'Buyer', email: 'buyer@example.test', role: 'CUSTOMER' };
const other = { id: 'other', name: 'Other', email: 'other@example.test', role: 'CUSTOMER' };
const admin = { id: 'admin', name: 'Admin', email: 'admin@example.test', role: 'ADMIN' };
let app, base, rows, calls, revokeWrites, nextError, lookupError = false;
function stored(user, token = user.id, overrides = {}) {
  return { id: `${token}-session`, userId: user.id, user, token, isValid: true, expiresAt: new Date(Date.now() + 60000), ...overrides };
}
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') {
      if ('not' in value) return row[key] !== value.not;
      if ('gt' in value) return row[key] > value.gt;
      if ('lte' in value) return row[key] <= value.lte;
    }
    return row[key] === value;
  });
}
const persistence = { session: {
  findUnique: async ({ where }) => { if (lookupError) throw new Error('secret-db-error'); return rows.find(r => matches(r, where)) || null; },
  findMany: async ({ where }) => rows.filter(r => matches(r, where)),
  count: async ({ where }) => rows.filter(r => matches(r, where)).length,
  groupBy: async ({ where }) => [...new Set(rows.filter(r => matches(r, where)).map(r => r.userId))].map(userId => ({ userId })),
  update: async ({ where, data }) => { if ('isValid' in data) revokeWrites++; const r = rows.find(r => matches(r, where)); return Object.assign(r, data); },
  updateMany: async ({ where, data }) => { const selected = rows.filter(r => matches(r, where)); selected.forEach(r => Object.assign(r, data)); revokeWrites += selected.length; return { count: selected.length }; },
  create: async ({ data }) => { const row = { id: 'login-session', ...data, user: buyer }; rows.push(row); return row; },
} };

before(async () => {
  const controllers = [SessionController, AuthController];
  const passwordHash = await bcrypt.hash('test-password', 4);
  persistence.user = { findUnique: async ({ where }) => where.email === buyer.email ? { ...buyer, passwordHash } : null };
  const sessions = new SessionService(persistence);
  const providers = [SessionAuthGuard, RolesGuard, PersistenceExceptionFilter,
    { provide: SessionService, useValue: sessions },
    { provide: AuthService, useValue: new AuthService(persistence, new JwtService({ secret: 'test-only-key', signOptions: { expiresIn: '72h' } }), sessions) },
  ];
  for (const name of ['coupons','offers','cms','crm','inventory','settings','upload','cache']) {
    const Controller = Object.values(require(`../src/${name}/${name}.controller`)).find(v => typeof v === 'function' && v.name.endsWith('Controller'));
    const Service = Object.values(require(`../src/${name}/${name === 'cache' ? 'custom-cache' : name}.service`)).find(v => typeof v === 'function' && v.name.endsWith('Service'));
    controllers.push(Controller);
    const stub = {};
    for (const method of Object.getOwnPropertyNames(Service.prototype).filter(k => k !== 'constructor' && k !== 'onModuleInit')) {
      stub[method] = async (...args) => { calls.push({ name, method, args }); if (nextError) { const error = nextError; nextError = null; throw error; } return method === 'bulkAdjust' ? [] : {}; };
    }
    providers.push({ provide: Service, useValue: stub });
  }
  class ReviewModule {}
  Module({ controllers, providers })(ReviewModule);
  app = await NestFactory.create(ReviewModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new PrivilegeFieldsPipe(), new ValidationPipe({ transform: true }));
  await app.listen(0, '127.0.0.1'); base = await app.getUrl();
});
beforeEach(() => {
  rows = [stored(buyer), stored(buyer, 'buyer-second'), stored(other), stored(admin), stored(buyer, 'expired', { expiresAt: new Date(0) }), stored(buyer, 'revoked', { isValid: false })];
  calls = []; revokeWrites = 0; nextError = null; lookupError = false;
});
after(async () => { await app?.close(); });
async function request(path, method = 'GET', token = 'admin', body) {
  return fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
}

const invalidRequests = [
  ['/coupons/validate', 'POST', { code: {}, cartTotal: 1 }],
  ['/coupons', 'POST', { code: 'TEST', value: 'bad' }],
  ['/coupons/id', 'PUT', { isActive: 'false' }],
  ['/offers', 'POST', { title: 'Sale', discountValue: 5, targetType: 'INVALID' }],
  ['/offers/id', 'PUT', { endDate: 'not-a-date' }],
  ['/cms/banners', 'POST', { isActive: 'false' }],
  ['/cms/pages/id', 'PUT', { isPublished: 'false' }],
  ['/cms/announcement', 'PUT', { isActive: null }],
  ['/crm/customers', 'POST', { name: 'Buyer', phone: {}, type: 'VIP' }],
  ['/crm/customers/id', 'PUT', { creditLimit: 'NaN' }],
  ['/crm/customers/id/notes', 'POST', { note: { userId: 'forged' } }],
  ['/inventory/adjust', 'POST', { productId: 'p1', delta: 1.5, reason: 'Stock' }],
  ['/inventory/bulk-adjust', 'POST', { items: [{ productId: 'p1', delta: 1, reason: 'Stock', createdBy: 'forged' }] }],
  ['/settings', 'PUT', { gstRate: null }],
  ['/upload/base64', 'POST', { image: {}, folder: 'Bill' }],
  ['/cache/flush', 'POST', { prefix: {} }],
];
for (const [path, method, body] of invalidRequests) {
  test(`Section 5: ${method} ${path} rejects invalid DTO before handler`, async () => {
    const res = await request(path, method, 'admin', body);
    assert.equal(res.status, 400, JSON.stringify(await res.json()));
    assert.equal(calls.length, 0);
  });
}
test('Section 5: unexpected identity/privilege fields are rejected on admin DTOs', async () => {
  for (const body of [{ userId: 'other' }, { role: 'ADMIN' }, { nested: { permissions: ['ADMIN'] } }]) {
    assert.equal((await request('/settings', 'PUT', 'admin', body)).status, 400);
  }
  assert.equal(calls.length, 0);
});
test('AUTHZ: validation never replaces 401/403 authentication and role enforcement', async () => {
  for (const path of ['/coupons/id','/offers/id','/cms/pages/id','/crm/customers/id','/settings']) {
    assert.equal((await request(path, 'PUT', null, { role: 'ADMIN' })).status, 401);
    assert.equal((await request(path, 'PUT', 'buyer', { role: 'ADMIN' })).status, 403);
  }
  assert.equal(calls.length, 0);
});
test('CAT07: existing form numbers, blank optional dates, empty CRM email and false booleans remain valid', async () => {
  const payloads = [
    ['/coupons','POST',{ code: 'TEST', value: '10', minOrderAmount: '0', maxDiscountAmount: '', usageLimit: '', validFrom: '', validUntil: '', isActive: false }],
    ['/offers','POST',{ title: 'Sale', discountValue: '10', startDate: '', endDate: '', priority: '1', isActive: false }],
    ['/crm/customers','POST',{ name: 'Buyer', phone: '1234567890', email: '', type: 'RETAIL', creditLimit: '0', initialNote: '' }],
    ['/inventory/adjust','POST',{ productId: 'p1', delta: '-2', reason: 'Adjustment' }],
    ['/settings','PUT',{ companyName: 'Store', gstRate: '5', defaultDiscountRate: 0, minOrderValue: 0, freeShippingThreshold: 0 }],
  ];
  for (const [path, method, body] of payloads) {
    const res = await request(path, method, 'admin', body);
    assert.equal(res.status, method === 'POST' ? 201 : 200, JSON.stringify(await res.json()));
  }
  assert.equal(calls[0].args[0].isActive, false);
  assert.equal(calls[0].args[0].value, 10);
});
test('CAT07: announcement editor can round-trip metadata without changing server fields', async () => {
  const res = await request('/cms/announcement','PUT','admin',{ id: 'forged', updatedAt: 'old', text: 'New text', isActive: false });
  assert.equal(res.status, 200);
  assert.deepEqual({ ...calls[0].args[0] }, { text: 'New text', isActive: false });
});
test('CAT07: product variant SKU is accepted; null required fields and nested operations are rejected', () => {
  assert.doesNotThrow(() => validateFields({ categoryId: null, brandRefId: null, sizeVariants: [{ size: 'XL', price: 10, mrp: 20, stock: 4, sku: 'XL-1' }] }, productFields));
  for (const body of [{ category: null }, { brand: null }, { brandId: null }, { sku: null }, { sizeVariants: [{ size: 'XL', sku: {} }] }, { categoryRef: { delete: true } }]) {
    assert.throws(() => validateFields(body, productFields), status(400));
  }
});

for (const code of ['P2002','P2003','P2034','P2025','P2000']) {
  test(`Section 5: persistence ${code} returns safe HTTP status`, async () => {
    nextError = new Prisma.PrismaClientKnownRequestError('secret token/password/customer payload', { code, clientVersion: 'test' });
    const res = await request('/offers/id','PUT','admin',{ title: 'Sale' });
    assert.equal(res.status, code === 'P2025' ? 404 : code === 'P2000' ? 400 : 409);
    assert.equal((await res.text()).includes('secret'), false);
  });
}
test('Section 5: Prisma validation errors return 400 without raw request data', async () => {
  nextError = new Prisma.PrismaClientValidationError('private customer values', { clientVersion: 'test' });
  const res = await request('/offers/id','PUT','admin',{ title: 'Sale' });
  assert.equal(res.status, 400); assert.equal((await res.text()).includes('private'), false);
});

test('T01/T02: real SessionService rejects missing, unknown, expired, revoked tokens and database failure over HTTP', async () => {
  for (const token of [null, 'unknown', 'expired', 'revoked']) assert.equal((await request('/session/active','GET',token)).status, 401);
  lookupError = true;
  assert.equal((await request('/session/active','GET','buyer')).status, 401);
});
test('SESS/T06: real service denies cross-user DELETE before any revocation; admin can revoke it', async () => {
  assert.equal((await request('/session/other-session','DELETE','buyer',{})).status, 403);
  assert.equal(revokeWrites, 0); assert.equal(rows.find(r => r.token === 'other').isValid, true);
  assert.equal((await request('/session/missing','DELETE','buyer',{})).status, 404);
  const response = await request('/session/other-session','DELETE','admin',{});
  assert.equal(response.status, 200); assert.equal(revokeWrites, 1);
  assert.equal('token' in (await response.json()).data, false);
});
test('SESS: real revoke-others derives identity, retains current session, leaves other users unchanged', async () => {
  assert.equal((await request('/session/revoke-others','POST','buyer',{ userId: 'other', currentToken: 'other' })).status, 403);
  assert.equal(revokeWrites, 0);
  assert.equal((await request('/session/revoke-others','POST','buyer',{})).status, 201);
  assert.equal(rows.find(r => r.token === 'buyer').isValid, true);
  assert.equal(rows.find(r => r.token === 'buyer-second').isValid, false);
  assert.equal(rows.find(r => r.token === 'other').isValid, true);
});
test('SESS: real revoke-all requires admin for another user and does not revoke the acting admin', async () => {
  assert.equal((await request('/session/revoke-all','POST','buyer',{ userId: 'other' })).status, 403);
  assert.equal(revokeWrites, 0);
  assert.equal((await request('/session/revoke-all','POST','admin',{ userId: 'other' })).status, 201);
  assert.equal(rows.find(r => r.token === 'admin').isValid, true);
  assert.equal(rows.find(r => r.token === 'other').isValid, false);
});
test('T12: real login, JWT issuance, persistent session, profile and logout flow over HTTP', async () => {
  const response = await request('/auth/login','POST',null,{ email: buyer.email, password: 'test-password' });
  assert.equal(response.status, 201);
  const { accessToken } = await response.json();
  assert.equal(accessToken.split('.').length, 3);
  assert(rows.some(r => r.token === accessToken));
  assert.equal((await request('/auth/profile','GET',accessToken)).status, 200);
  assert.equal((await request('/auth/logout','POST',accessToken,{})).status, 201);
  assert.equal((await request('/auth/profile','GET',accessToken)).status, 401);
});

test('Sensitive logging: upload success and provider failure never log filename/URL/error payload', async () => {
  const { UploadService } = require('../src/upload/upload.service');
  const service = Object.create(UploadService.prototype);
  const logs = [];
  service.logger = { log: (...v) => logs.push(v), warn: (...v) => logs.push(v), error: (...v) => logs.push(v) };
  service.bucketName = 'test'; service.s3Client = { send: async () => ({}) };
  service.getPublicUrl = () => ({ url: 'https://example.test/private-invoice', isCloudFront: true });
  await service.uploadBuffer(Buffer.from('test'), 'private-customer-invoice.pdf', 'application/pdf', 'Bill');
  service.s3Client.send = async () => { throw new Error('private-secret-token'); };
  await service.ensureS3Folders();
  assert.equal(JSON.stringify(logs).includes('private'), false);
});
test('Sensitive logging: CMS errors and cache prefixes are not echoed', async () => {
  const fs = require('node:fs');
  const { CmsService } = require('../src/cms/cms.service');
  const { CustomCacheService } = require('../src/cache/custom-cache.service');
  const logs = [];
  const originalWrite = fs.writeFileSync, originalRead = fs.readFileSync, originalExists = fs.existsSync, originalError = console.error;
  try {
    console.error = (...v) => logs.push(v);
    fs.existsSync = () => true;
    fs.readFileSync = () => { throw new Error('private-customer-data'); };
    fs.writeFileSync = () => { throw new Error('private-path'); };
    const cms = Object.create(CmsService.prototype);
    cms.defaultBanners = []; cms.defaultPages = []; cms.defaultAnnouncement = {};
    cms.loadData(); cms.saveData();
  } finally { fs.writeFileSync = originalWrite; fs.readFileSync = originalRead; fs.existsSync = originalExists; console.error = originalError; }
  const cache = new CustomCacheService(); cache.logger = { log: (...v) => logs.push(v) };
  await cache.invalidatePrefix('private-access-token');
  assert.equal(JSON.stringify(logs).includes('private'), false);
});
test('Sensitive logging: existing Prisma startup error is sanitized without executing SQL', async () => {
  const { PrismaService } = require('../src/prisma/prisma.service');
  const logs = [];
  const service = Object.create(PrismaService.prototype);
  service.logger = { error: (...v) => logs.push(v), log: () => {} };
  service.$executeRawUnsafe = async () => { throw new Error('private-database-secret'); };
  await assert.rejects(service.ensureSchema());
  assert.equal(JSON.stringify(logs).includes('private'), false);
});

test('Section 5: duplicate coupon/customer conflicts are 409 and do not write', async () => {
  const { CouponsService } = require('../src/coupons/coupons.service');
  const { CrmService } = require('../src/crm/crm.service');
  const coupon = new CouponsService({ coupon: { findUnique: async () => ({ id: 'exists' }), create: () => assert.fail('duplicate write') } });
  const crm = new CrmService({ customer: { findUnique: async () => ({ id: 'exists' }), create: () => assert.fail('duplicate write') } }, {});
  await assert.rejects(coupon.create({ code: 'TEST', value: 5 }), status(409));
  await assert.rejects(crm.create({ name: 'Buyer', phone: '123' }), status(409));
});
test('Section 5: authorization exceptions are never converted to success or persistence errors', async () => {
  const { ForbiddenException } = require('@nestjs/common');
  nextError = new ForbiddenException('Denied');
  assert.equal((await request('/offers/id','PUT','admin',{ title: 'Sale' })).status, 403);
});
test('CAT07: transformed announcement metadata leaves existing record identity intact', async () => {
  const { CmsService } = require('../src/cms/cms.service');
  const cms = Object.create(CmsService.prototype);
  cms.announcement = { id: 'announcement-1', text: 'Old', isActive: true };
  cms.saveData = () => {}; // No filesystem persistence in tests.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const body = await pipe.transform({ id: 'forged', updatedAt: 'old', text: 'New', isActive: false }, { type: 'body', metatype: dto.AnnouncementDto });
  const updated = await cms.updateAnnouncement(body);
  assert.equal(updated.id, 'announcement-1'); assert.equal(updated.text, 'New'); assert.equal(updated.isActive, false);
  assert.notEqual(updated.updatedAt, 'old');
});
