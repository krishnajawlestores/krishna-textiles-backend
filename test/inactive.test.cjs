require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { InactiveService } = require('../src/inactive/inactive.service');
const { InactiveController } = require('../src/inactive/inactive.controller');
const { ActivateInactiveDto, InactiveQueryDto } = require('../src/inactive/inactive.dto');

const cache = { invalidatePrefix: async () => {} };
const cms = {
  getAllBanners: async () => [{ id: 'b', title: 'Sale', isActive: false, updatedAt: '2026-01-01' }, { id: 'active', isActive: true }],
  getAllPages: async () => [{ id: 'p', title: 'Policy', slug: 'policy', isPublished: false, updatedAt: '2026-02-01' }],
  getAnnouncement: async () => ({ id: 'a', text: 'News', isActive: false, updatedAt: '2026-03-01' }),
  activateInactiveRecords: async rows => ({ count: rows.length }),
};
test('CMS combines only inactive records, filters types/search and clamps pagination', async () => {
  const service = new InactiveService({}, cache, cms);
  const all = await service.list('cms', { limit: 2, page: 99 });
  assert.equal(all.total, 3); assert.equal(all.page, 2); assert.equal(all.data.length, 1);
  const filtered = await service.list('cms', { cmsType: 'page', search: 'POLICY' });
  assert.equal(filtered.total, 1); assert.equal(filtered.data[0].id, 'page:p');
  assert.deepEqual(await service.activate('cms', { all: true, cmsType: 'page' }), { count: 1 });
});
test('bulk activation is filter scoped, not page scoped, and never changes order status', async () => {
  let update;
  const tx = { order: { updateMany: async args => { update = args; return { count: 25 }; } } };
  const service = new InactiveService({ $transaction: async fn => fn(tx) }, cache, cms);
  assert.deepEqual(await service.activate('orders', { all: true, search: 'Buyer', page: 2, limit: 10 }), { count: 25 });
  assert.equal(update.where.isActive, false); assert.equal(update.where.OR[1].customerName.contains, 'Buyer');
  assert.deepEqual(update.data, { isActive: true }); assert.equal(update.take, undefined);
});
test('selected activation only changes inactive requested ids', async () => {
  let update;
  const tx = { category: { updateMany: async args => { update = args; return { count: 1 }; } } };
  const service = new InactiveService({ $transaction: async fn => fn(tx) }, cache, cms);
  await service.activate('categories', { ids: ['one'] });
  assert.deepEqual(update.where, { isActive: false, id: { in: ['one'] } });
  await assert.rejects(() => service.activate('categories', {}));
  await assert.rejects(() => service.activate('categories', { all: true, ids: ['one'] }));
  await assert.rejects(() => service.list('__proto__', {}));
});
test('inactive parent blocks product/stock activation before any mutation', async () => {
  let writes = 0;
  const tx = {
    product: { findMany: async () => [{ categoryId: 'c' }], updateMany: async () => { writes++; } },
    category: { findUnique: async () => ({ isActive: false }) },
    brand: { findFirst: async () => null },
  };
  const service = new InactiveService({ $transaction: async fn => fn(tx) }, cache, cms);
  await assert.rejects(() => service.activate('stocks', { all: true }), /active category/);
  assert.equal(writes, 0);
});
test('listing sends pagination and inactive/stock filters to the database', async () => {
  let lookup;
  const service = new InactiveService({ product: { count: async () => 31, findMany: async args => { lookup = args; return []; } } }, cache, cms);
  const result = await service.list('stocks', { page: 2, limit: 10, stock: 'out' });
  assert.equal(result.totalPages, 4); assert.equal(lookup.skip, 10); assert.equal(lookup.take, 10);
  assert.deepEqual(lookup.where, { isActive: false, stock: { lte: 0 } });
});
test('routes require admin role and reject malformed payloads', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', InactiveController), ['ADMIN']);
  assert.equal(Reflect.getMetadata('__guards__', InactiveController).length, 2);
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  for (const body of [{ all: 'true' }, { ids: [] }, { ids: ['a', 'a'] }, { all: true, status: 'PENDING' }]) {
    await assert.rejects(() => pipe.transform(body, { type: 'body', metatype: ActivateInactiveDto }));
  }
  await assert.rejects(() => pipe.transform({ page: '0' }, { type: 'query', metatype: InactiveQueryDto }));
  await assert.rejects(() => pipe.transform({ limit: '101' }, { type: 'query', metatype: InactiveQueryDto }));
});
