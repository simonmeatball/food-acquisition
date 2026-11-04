import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('    function surveyCostDollars('), html.indexOf("    $('#openSurvey').onclick="));

function surveyHarness({ amount = '', unit = 'usd', online = true } = {}) {
  const fields = new Map(Object.entries({
    name: 'Guest', mealId: 'lunch', calories: '5', meal: 'Lunch',
    rating: '8', recommend: 'Yes', cost: amount, costUnit: unit,
  }));
  const input = { value: amount, dataset: {}, setAttribute(name, value) { this[name] = value; } };
  const elements = {
    '#cost': input, '#costUnit': { value: unit }, '#costPrefix': {}, '#costHelp': {},
    '#surveyForm': { reset() {
      fields.set('cost', ''); fields.set('costUnit', 'usd');
      input.value = ''; elements['#costUnit'].value = 'usd';
    } },
    '#name': {}, '#calorieValue': {}, '#ratingValue': {},
    '#surveySuccess': { classList: { add() {}, remove() {} } },
  };
  const sent = [], data = { responses: [] }, messages = [];
  const context = vm.createContext({
    $: selector => elements[selector], $$: () => [],
    FormData: class { get(key) { return fields.get(key); } },
    requirePersistence: () => true, setCurrentUser() {}, currentUser: { name: 'Guest' },
    backendReady: online, data, activeVoteId: null,
    api: async (path, options) => { sent.push({ path, body: JSON.parse(options.body) }); return JSON.parse(options.body); },
    refreshStatistics: async () => {}, save() {}, render() {},
    toast: message => messages.push(message), setTimeout() {},
  });
  vm.runInContext(source, context);
  vm.runInContext('updateCostPresentation()', context);
  return {
    input, elements, sent, data, messages,
    convert: (value, selectedUnit) => context.surveyCostDollars(value, selectedUnit),
    changeUnit(unit) {
      elements['#costUnit'].value = unit;
      elements['#costUnit'].onchange();
      fields.set('costUnit', unit); fields.set('cost', input.value);
    },
    submit: () => elements['#surveyForm'].onsubmit({ preventDefault() {}, target: elements['#surveyForm'] }),
  };
}

test('smoothie conversion supports whole, fractional, zero, and cent rounding', () => {
  const h = surveyHarness();
  for (const [amount, expected] of [['2', 40], ['1.5', 30], ['0.25', 5], ['0', 0], ['0.333', 6.66], ['1.2345', 24.69]]) {
    assert.equal(h.convert(amount, 'smoothies'), expected);
  }
  assert.equal(h.convert('19.99', 'usd'), 19.99);
});

test('switching units preserves the meal value and shows dollars to be saved', () => {
  const h = surveyHarness({ amount: '25.50' });
  h.changeUnit('smoothies');
  assert.equal(h.input.value, '1.275');
  assert.equal(h.input.step, 'any');
  assert.equal(h.input['aria-label'], 'Cost in Erewhon smoothies');
  assert.match(h.elements['#costHelp'].textContent, /\$25.50 will be saved/);
  h.changeUnit('usd');
  assert.equal(h.input.value, '25.5');
  assert.equal(h.input.step, '0.01');
  assert.equal(h.elements['#costPrefix'].textContent, '$');
});

for (const online of [true, false]) {
  test(`survey saves smoothie entry as dollars ${online ? 'through the API' : 'in local storage'}`, async () => {
    const h = surveyHarness({ amount: '1.5', unit: 'smoothies', online });
    await h.submit();
    assert.deepEqual(h.messages, []);
    assert.equal(h.data.responses[0].cost, 30);
    if (online) {
      assert.equal(h.sent[0].path, '/api/responses');
      assert.equal(h.sent[0].body.cost, 30);
      assert.equal(h.sent[0].body.costUnit, undefined);
    }
    assert.equal(h.elements['#costUnit'].value, 'usd');
    assert.equal(h.input.dataset.unit, 'usd');
    assert.equal(h.elements['#costPrefix'].textContent, '$');
    assert.doesNotMatch(h.elements['#costHelp'].textContent, /will be saved/);
  });
}

test('dollar entries are submitted without smoothie conversion', async () => {
  const h = surveyHarness({ amount: '18.75' });
  await h.submit();
  assert.equal(h.sent[0].body.cost, 18.75);
});
