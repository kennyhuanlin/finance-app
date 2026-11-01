/* eslint-disable @typescript-eslint/no-require-imports -- isolated Node regression fixture */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Same CommonJS TypeScript hook as repair.test.cjs so extensionless app imports resolve.
require.extensions['.ts'] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const { amortizePeriodicTransactions } = require('../app/lib/amortization');

const rules = [
  { id: 'parking', frequency: 'yearly' },
  { id: 'life', frequency: 'yearly' },
  { id: 'quarter', frequency: 'quarterly' },
  { id: 'rent', frequency: 'monthly' },
];
const tx = (id, date, amount, extra = {}) => ({
  id, date, amount, type: '支出', category: '汽車交通', categoryId: 'transport',
  note: id, sourceType: 'recurring', recurringId: null, currency: 'TWD', ...extra,
});

test('yearly parking prepayment becomes 12 monthly shares starting the next month', () => {
  const out = amortizePeriodicTransactions(
    [tx('白金車位', '2026-10-27', 43200, { recurringId: 'parking' })], rules);
  assert.equal(out.length, 12);
  assert.ok(!out.some((t) => t.date === '2026-10-27'), 'October no longer carries the lump');
  assert.deepEqual(out.map((t) => t.date), [
    '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01', '2027-04-01',
    '2027-05-01', '2027-06-01', '2027-07-01', '2027-08-01', '2027-09-01', '2027-10-01',
  ]);
  assert.ok(out.every((t) => t.amount === 3600));
  assert.ok(out.every((t) => t.category === '汽車交通' && t.categoryId === 'transport' && t.currency === 'TWD'));
  assert.ok(out.every((t) => t.sourceType === 'recurring' && t.amortizedFrom === '白金車位'));
  assert.equal(out[0].note, '白金車位（年付月化 1/12）');
  assert.equal(out[11].note, '白金車位（年付月化 12/12）');
  assert.equal(new Set(out.map((t) => t.id)).size, 12, 'virtual ids are unique');
});

test('shares always add back to the paid amount', () => {
  const out = amortizePeriodicTransactions([
    tx('壽險', '2026-10-30', 59103, { recurringId: 'life' }),
    tx('季繳', '2026-12-15', 1000, { recurringId: 'quarter' }),
  ], rules);
  const life = out.filter((t) => t.amortizedFrom === '壽險');
  assert.equal(life.length, 12);
  assert.equal(Math.round(life.reduce((s, t) => s + t.amount, 0) * 100) / 100, 59103);
  const quarter = out.filter((t) => t.amortizedFrom === '季繳');
  assert.deepEqual(quarter.map((t) => [t.date, t.amount]), [
    ['2027-01-01', 333.33], ['2027-02-01', 333.33], ['2027-03-01', 333.34],
  ]);
  assert.equal(quarter[0].note, '季繳（季付月化 1/3）');
});

test('monthly, manual, unknown-rule, income and invalid rows are left untouched', () => {
  const rows = [
    tx('房租', '2026-11-01', 20000, { recurringId: 'rent' }),
    tx('午餐', '2026-11-02', 120, { sourceType: 'manual' }),
    tx('已刪規則', '2026-11-03', 500, { recurringId: 'gone' }),
    tx('退款', '2026-11-04', 43200, { recurringId: 'parking', type: '收入' }),
    tx('零元', '2026-11-05', 0, { recurringId: 'parking' }),
    tx('壞日期', 'not-a-date', 43200, { recurringId: 'parking' }),
  ];
  const out = amortizePeriodicTransactions(rows, rules);
  assert.deepEqual(out, rows);
});

test('shares after the as-of date are not counted yet', () => {
  const out = amortizePeriodicTransactions(
    [tx('白金車位', '2026-10-27', 43200, { recurringId: 'parking' })], rules, '2026-11-01');
  assert.deepEqual(out.map((t) => [t.date, t.amount]), [['2026-11-01', 3600]]);
  assert.deepEqual(amortizePeriodicTransactions(
    [tx('白金車位', '2026-10-27', 43200, { recurringId: 'parking' })], rules, '2026-10-31'), []);
  assert.equal(amortizePeriodicTransactions(
    [tx('白金車位', '2026-10-27', 43200, { recurringId: 'parking' })], rules, '2027-12-31').length, 12);
});

test('no rules means actual payments are returned as-is', () => {
  const rows = [tx('白金車位', '2026-10-27', 43200, { recurringId: 'parking' })];
  assert.deepEqual(amortizePeriodicTransactions(rows, []), rows);
});
