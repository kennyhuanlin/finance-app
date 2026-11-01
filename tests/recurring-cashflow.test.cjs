/* eslint-disable @typescript-eslint/no-require-imports -- isolated Node regression fixture */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Same CommonJS TypeScript hook as repair.test.cjs so extensionless app imports resolve.
require.extensions['.ts'] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
const {
  monthlyEquivalent,
  splitMonthlyBudget,
  projectRecurringCashflow,
} = require('../app/lib/recurringCashflow');

const m = (name, amount, nextRunDate, extra = {}) => ({ name, amount, frequency: 'monthly', nextRunDate, ...extra });
// Synthetic copy of the active TWD expense rules after the 2026-11-01 run,
// with parking as a yearly prepayment.
const rules = [
  m('房租', 20000, '2026-12-01'),
  m('ChatGPT', 3300, '2026-12-01'),
  m('國泰', 2440, '2026-12-01'),
  m('三商', 1648, '2026-12-01'),
  m('Gogoro', 287, '2026-12-01'),
  m('車貸', 19448, '2026-12-01', { remainingCount: '63' }),
  m('青創', 9000, '2026-12-01', { endDate: '2026-12-01' }),
  m('富邦', 453, '2026-12-01'),
  m('中華電信', 799, '2026-11-02', { startDate: '2026-07-02' }),
  m('迪士尼', 249, '2026-11-19', { startDate: '2026-10-19' }),
  { name: '壽險', amount: 59103, frequency: 'yearly', nextRunDate: '2027-10-30', startDate: '2026-10-30' },
  { name: '車位', amount: 43200, frequency: 'yearly', nextRunDate: '2027-10-27', startDate: '2026-10-27' },
];

test('monthly equivalent per frequency', () => {
  assert.equal(monthlyEquivalent({ amount: 43200, frequency: 'yearly' }), 3600);
  assert.equal(monthlyEquivalent({ amount: 900, frequency: 'quarterly' }), 300);
  assert.equal(monthlyEquivalent({ amount: 799, frequency: 'monthly' }), 799);
  assert.equal(monthlyEquivalent({ amount: 12, frequency: 'weekly' }), 52);
  assert.equal(monthlyEquivalent({ amount: 12, frequency: 'daily' }), 365);
});

test('budget splits every-month charges from yearly reserve', () => {
  const budget = splitMonthlyBudget(rules);
  assert.equal(budget.everyMonth, 57624);
  assert.equal(budget.reserve, (59103 + 43200) / 12);
  assert.equal(budget.total, 57624 + (59103 + 43200) / 12);
});

test('12-month projection puts yearly lumps in their month and honours end date', () => {
  const months = projectRecurringCashflow(rules, '2026-11-01', 12);
  assert.deepEqual(months.map((x) => x.month), [
    '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04',
    '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10',
  ]);
  const byMonth = Object.fromEntries(months.map((x) => [x.month, x]));
  assert.equal(byMonth['2026-11'].total, 799 + 249);
  assert.equal(byMonth['2026-12'].total, 57624);
  assert.equal(byMonth['2027-01'].total, 57624 - 9000, '青創 stops after its end date');
  assert.equal(byMonth['2027-10'].total, 48624 + 43200 + 59103);
  assert.deepEqual(
    byMonth['2027-10'].items.filter((i) => i.frequency === 'yearly').map((i) => [i.name, i.amount]),
    [['壽險', 59103], ['車位', 43200]],
  );
  for (const month of ['2027-02', '2027-09']) {
    assert.ok(!byMonth[month].items.some((i) => i.name === '車位'), `no parking charge in ${month}`);
  }
});

test('remaining count limits postings and zero count posts nothing', () => {
  const months = projectRecurringCashflow([
    m('分期', 1000, '2026-11-05', { remainingCount: '2' }),
    m('已結清', 500, '2026-11-05', { remainingCount: '0' }),
  ], '2026-11-01', 6);
  assert.deepEqual(months.map((x) => x.total), [1000, 1000, 0, 0, 0, 0]);
});

test('past-due next run date is not backfilled', () => {
  const months = projectRecurringCashflow([m('逾期', 100, '2026-10-01')], '2026-11-01', 3);
  assert.deepEqual(months.map((x) => x.total), [0, 0, 0]);
});

test('month-end anchor clamps in February and returns to the 31st', () => {
  const months = projectRecurringCashflow(
    [m('月底', 100, '2027-01-31', { startDate: '2026-12-31' })], '2027-01-01', 3);
  assert.deepEqual(months.map((x) => [x.month, x.total]), [['2027-01', 100], ['2027-02', 100], ['2027-03', 100]]);
});

test('quarterly and weekly rules aggregate inside a month; invalid rules are ignored', () => {
  const months = projectRecurringCashflow([
    { name: '季繳', amount: 900, frequency: 'quarterly', nextRunDate: '2026-11-10' },
    { name: '週', amount: 10, frequency: 'weekly', nextRunDate: '2026-11-02' },
    { name: '壞金額', amount: Number.NaN, frequency: 'monthly', nextRunDate: '2026-11-02' },
    { name: '壞日期', amount: 10, frequency: 'monthly', nextRunDate: '2026-02-30' },
  ], '2026-11-01', 4);
  const nov = months[0];
  assert.equal(nov.items.find((i) => i.name === '週').amount, 50, '5 Mondays in Nov 2026');
  assert.equal(nov.total, 950);
  assert.equal(months[1].total, 40);
  assert.equal(months[3].items.find((i) => i.name === '季繳').amount, 900);
});
