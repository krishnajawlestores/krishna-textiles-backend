const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual providers with a small hook runner, without a browser or live account.
function provider(file, name) {
  const slots = [], effects = [], storage = new Map();
  let cursor = 0, effectCursor = 0, queued = [], auth;
  const react = {
    createContext: () => ({ Provider: 'provider' }),
    useContext: () => null,
    useState: initial => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useEffect: (fn, deps) => {
      const i = effectCursor++;
      if (!effects[i] || deps.some((v, n) => v !== effects[i][n])) queued.push(fn);
      effects[i] = deps;
    },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../krishna-textiles-frontend', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, localStorage: {
    getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value),
  }, require: id => {
    if (id === 'react') return react;
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => props };
    if (id === '@/context/AuthContext') return { useAuth: () => auth };
    if (id === '@/lib/pricing') return { calculateUnitPrice: price => price };
    throw new Error(id);
  } });
  const render = () => {
    cursor = 0; effectCursor = 0; queued = [];
    const value = exports[name]({}).value;
    queued.forEach(fn => fn());
    return value;
  };
  return { storage, setAuth: value => { auth = value; }, render };
}

for (const [file, name, add, key, prefix] of [
  ['components/CartContext.js', 'CartProvider', 'addItem', 'items', 'krishna-textiles-cart'],
  ['context/WishlistContext.js', 'WishlistProvider', 'addToWishlist', 'wishlist', 'kt_customer_wishlist'],
]) {
  test(`${name}: guests cannot add, signed-in users can, and accounts stay isolated`, () => {
    const h = provider(file, name);
    let prompts = 0;
    const product = { id: 'p', name: 'Shirt', price: 100, stock: 5 };
    h.setAuth({ isAuthenticated: false, user: null, requireSignIn: () => { prompts++; return false; } });
    h.render(); let value = h.render();
    assert.equal(value[add](product), false);
    assert.equal(h.render()[key].length, 0); assert.equal(prompts, 1);
    assert.equal(h.storage.size, 0);
    h.setAuth({ isAuthenticated: true, user: { id: 'alice' }, requireSignIn: () => true });
    h.render(); value = h.render(); value[add](product);
    assert.equal(h.render()[key].length, 1);
    assert.equal(JSON.parse(h.storage.get(`${prefix}:alice`)).length, 1);
    h.setAuth({ isAuthenticated: true, user: { id: 'bob' }, requireSignIn: () => true });
    assert.equal(h.render()[key].length, 0); assert.equal(h.render()[key].length, 0);
    assert.equal(JSON.parse(h.storage.get(`${prefix}:alice`)).length, 1);
    h.setAuth({ isAuthenticated: true, user: { id: 'alice' }, requireSignIn: () => true });
    h.render(); assert.equal(h.render()[key].length, 1);
  });
}
