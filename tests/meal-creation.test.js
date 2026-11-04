import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../api/meals.js', import.meta.url), 'utf8');

function mealFormHarness({ request, statistics = async () => {} } = {}) {
  const button = { disabled: false, textContent: 'Save meal →' };
  const form = { dataset: {}, querySelector: () => button, reset() {} };
  const modal = { classList: { add() {}, remove() {} } };
  const elements = {
    '#mealForm': form, '#sourcePollId': { value: '' },
    '#mealName': { value: 'Team lunch' }, '#mealModal': modal,
    '#mealModalTitle': {},
  };
  const messages = [], opened = [], data = { meals: [] };
  let nextId = 0;
  const context = vm.createContext({
    $: selector => elements[selector], requirePersistence: () => true,
    crypto: { randomUUID: () => `meal-${++nextId}` },
    backendReady: true, data, api: request,
    save() {}, renderMeals() {}, render() {}, refreshStatistics: statistics,
    toast: message => messages.push(message), openMealFeedback: id => opened.push(id),
  });
  const modalSource = html.slice(html.indexOf('    let mealSaving='), html.indexOf('    function openShare('));
  const handlerSource = html.slice(html.indexOf("    $('#mealForm').onsubmit="), html.indexOf("    $('#calories').oninput="));
  vm.runInContext(modalSource + handlerSource, context);
  return {
    button, form, data, messages, opened,
    submit: () => form.onsubmit({ preventDefault() {}, currentTarget: form }),
    open: () => vm.runInContext('openMealModal("","Team lunch")', context),
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('rapid repeated submissions send one request and add one meal', async () => {
  const pending = deferred();
  let calls = 0;
  const h = mealFormHarness({ request: async (_path, options) => {
    calls++;
    await pending.promise;
    return JSON.parse(options.body);
  } });
  const first = h.submit();
  assert.equal(h.button.disabled, true);
  assert.equal(h.button.textContent, 'Saving…');
  await h.submit();
  h.open(); // Opening the modal again cannot reset an in-flight save.
  assert.equal(calls, 1);
  pending.resolve();
  await first;
  assert.equal(h.data.meals.length, 1);
  assert.deepEqual(h.opened, ['meal-1']);
  assert.equal(h.button.disabled, false);
});

test('retry after a lost response reuses the original meal ID', async () => {
  const ids = [];
  const h = mealFormHarness({ request: async (_path, options) => {
    const meal = JSON.parse(options.body);
    ids.push(meal.id);
    if (ids.length === 1) throw new Error('Connection lost');
    return meal;
  } });
  await h.submit();
  assert.equal(h.button.disabled, false);
  assert.equal(h.messages[0], 'Connection lost');
  await h.submit();
  assert.deepEqual(ids, ['meal-1', 'meal-1']);
  assert.equal(h.data.meals.length, 1);
  h.open();
  await h.submit();
  assert.equal(ids[2], 'meal-2');
});

test('statistics failure still completes a successful meal save', async () => {
  const h = mealFormHarness({
    request: async (_path, options) => JSON.parse(options.body),
    statistics: async () => { throw new Error('Statistics unavailable'); },
  });
  await h.submit();
  assert.deepEqual(h.opened, ['meal-1']);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /Meal saved/);
});

function apiHarness() {
  const rows = new Map();
  const sql = async (parts, ...values) => {
    const query = parts.join('?');
    if (query.includes('INSERT INTO food_meals')) {
      const [id, name, source_poll_id] = values;
      const existing = rows.get(id) || [...rows.values()].find(row => source_poll_id && row.source_poll_id === source_poll_id);
      if (existing) {
        assert.match(query, /ON CONFLICT DO NOTHING/);
        return [];
      }
      const row = { id, name, source_poll_id, created_at: '2026-11-03' };
      rows.set(id, row);
      return [row];
    }
    if (query.includes('FROM food_polls')) return [{ id: values[0] }];
    if (query.includes('WHERE id =')) {
      return [rows.get(values[0]) || [...rows.values()].find(row => values[1] && row.source_poll_id === values[1])].filter(Boolean);
    }
    if (query.includes('WHERE source_poll_id =')) {
      return [...rows.values()].filter(row => row.source_poll_id === values[0]);
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  const context = vm.createContext({
    database: () => sql, ensureSchema: async () => {},
    sendError: (_res, error) => { throw error; },
  });
  vm.runInContext(apiSource.replace(/^import .*;\n/, '').replace('export default ', ''), context);
  return {
    rows,
    async post(body) {
      const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await context.handler({ method: 'POST', body }, res);
      return res;
    },
  };
}

test('concurrent API retries return the same standalone meal without overwriting it', async () => {
  const h = apiHarness();
  const results = await Promise.all([
    h.post({ id: 'one', name: 'Lunch' }),
    h.post({ id: 'one', name: 'Changed retry' }),
  ]);
  assert.equal(h.rows.size, 1);
  assert.deepEqual(results.map(res => res.code).sort(), [200, 201]);
  assert.ok(results.every(res => res.body.id === 'one' && res.body.name === 'Lunch'));
});

test('concurrent poll meal requests with different IDs return one canonical meal', async () => {
  const h = apiHarness();
  const results = await Promise.all([
    h.post({ id: 'one', name: 'Lunch', sourcePollId: 'poll' }),
    h.post({ id: 'two', name: 'Lunch', sourcePollId: 'poll' }),
  ]);
  assert.equal(h.rows.size, 1);
  assert.ok(results.every(res => res.body.id === 'one'));
  assert.deepEqual(results.map(res => res.code).sort(), [200, 201]);
});

test('separate intentional meals can have the same name', async () => {
  const h = apiHarness();
  await h.post({ id: 'one', name: 'Lunch' });
  await h.post({ id: 'two', name: 'Lunch' });
  assert.equal(h.rows.size, 2);
});
