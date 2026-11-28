require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ProductsService } = require('../src/products/products.service');

function setup() {
  let query, countQuery;
  const db = {
    category: { findMany: async () => [] }, brand: { findMany: async () => [] },
    product: {
      fields: { price: 'price-field' },
      count: async args => { countQuery = args; return 65; },
      findMany: async args => { query = args; return [{ id: 'page-product' }]; },
      aggregate: async () => ({ _max: { price: 9500 } }),
    },
  };
  return { service: new ProductsService(db, {}), query: () => query, countQuery: () => countQuery };
}
test('catalog fetches only requested page with stable sorting and matching total filters', async () => {
  const f = setup();
  const result = await f.service.findAll({ page: 3, limit: 24, sort: 'price-low', minRating: 4, minDiscount: 10, stockStatus: 'in', maxPrice: 0, includeFacets: 'true' });
  assert.equal(f.query().skip, 48); assert.equal(f.query().take, 24);
  assert.deepEqual(f.query().orderBy, [{ price: 'asc' }, { id: 'asc' }]);
  assert.deepEqual(f.query().where, f.countQuery().where);
  assert.ok(f.query().where.AND.some(x => x.price?.lte === 0));
  assert.ok(f.query().where.AND.some(x => x.stock?.gt === 0));
  assert.ok(f.query().where.AND.some(x => x.rating?.gte === 4));
  assert.equal(result.totalPages, 3); assert.equal(result.maxPrice, 9500);
});
test('deals filter and selected brands/categories execute before pagination', async () => {
  const f = setup();
  await f.service.findAll({ brandIds: 'one,two', categoryIds: 'three', dealsOnly: 'true', sort: 'discount', page: 2, limit: 12 });
  assert.equal(f.query().skip, 12);
  const and = f.query().where.AND;
  assert.ok(and.some(x => x.OR?.some(y => y.brandRef?.id.in.join(',') === 'one,two')));
  assert.ok(and.some(x => x.OR?.some(y => y.categoryRef?.id.in[0] === 'three')));
  assert.ok(and.some(x => x.OR?.some(y => y.mrp?.gt === 'price-field')));
});
test('catalog rejects invalid pagination, sort and filter inputs', async () => {
  for (const params of [{ page: -1 }, { limit: 1000 }, { sort: '__proto__' }, { minRating: 'oops' }, { categoryIds: ['one'] }, { dealsOnly: 'yes' }]) {
    await assert.rejects(() => setup().service.findAll(params), e => e.getStatus() === 400);
  }
});

test('unselected rating and discount filters do not exclude catalog products', async () => {
  for (const params of [{}, { minRating: 0, minDiscount: 0 }, { minRating: '0', minDiscount: '0' }]) {
    const f = setup();
    await f.service.findAll(params);
    const and = f.query().where.AND;
    assert.equal(and.some(x => x.rating || x.discount), false);
    assert.deepEqual(f.query().where, f.countQuery().where);
  }
});
