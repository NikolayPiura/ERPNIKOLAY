import { dateKey, months, number, sum } from '../core/format.js';
import { keys, readJson } from '../core/storage.js';

export const financeFallback = {
  meta: { updated: 'Сохранённый снимок 2026' },
  summary: {
    income: { Янв: 26715.9, Фев: 23117.75, Мар: 25308.84, Апр: 29255.19, Май: 17022.05, Июн: 31019.67, Июл: 37267.91, total: 189707.31 },
    expenses: { Янв: 10045, Фев: 10125.75, Мар: 11824.4, Апр: 17254, Май: 58432, Июн: 56535, Июл: 15826, total: 180042.15 },
    passive: { Янв: 12370, Фев: 12713, Мар: 9914, Апр: 9070, Май: 10451, Июн: 0, Июл: 10, total: 54528 }
  },
  sources: {
    sources: [
      { name: 'КЭ · зарплата', total: 80473.39 }, { name: 'PFF · дивиденды', total: 44953.49 },
      { name: 'Наставник · проекты', total: 40638.4 }, { name: 'PFF · управляющий', total: 13812.59 },
      { name: 'Москва · управляющий', total: 6354.29 }, { name: 'Solid · управляющий', total: 3767 }
    ],
    planYear: 360000,
    fact_total: 197299.59
  }
};

export const defaultTimeCategories = [
  { key: 'klim', label: 'Климат', work: false }, { key: 'inv', label: 'Инвестиции', work: true },
  { key: 'money', label: 'Управление деньгами', work: true }, { key: 'nav', label: 'Наставник', work: true },
  { key: 'eff', label: 'Эффективность', work: true }, { key: 'edu', label: 'Обучение', work: false },
  { key: 'hobby', label: 'Хобби', work: false }, { key: 'friend', label: 'Фонд Друг', work: true }
];

export const defaultMorningBlocks = [
  { id: 'b1', name: 'Старт дня', items: [
    { id: 'wake', words: [{ t: 'Поднялся вовремя и начал день без телефона' }] },
    { id: 'water', words: [{ t: 'Вода, гигиена и утренняя прогулка' }] },
    { id: 'body', words: [{ t: 'Зарядка, спина и физические упражнения' }] },
    { id: 'desk', words: [{ t: 'Рабочее место готово к старту' }] }
  ]},
  { id: 'b2', name: 'Фокус', items: [
    { id: 'goals', words: [{ t: 'Сверил долгосрочные цели' }] },
    { id: 'plan', words: [{ t: 'Определил главный результат дня' }] },
    { id: 'calendar', words: [{ t: 'Проверил план и календарь' }] }
  ]},
  { id: 'b3', name: 'Вопросы эффективности', items: [
    { id: 'improve', words: [{ t: 'Что сегодня нужно улучшить?' }] },
    { id: 'delegate', words: [{ t: 'Что можно делегировать или убрать?' }] },
    { id: 'value', words: [{ t: 'Какую главную ценность я создам?' }] }
  ]}
];

export const defaultFunds = [
  { id: 1, name: 'MOSCOW FUND', currency: 'RUB', liveUsd: 261542, liveMon: 2780, liveYld: 12.76 },
  { id: 2, name: 'PIURA FAMILY FUND', currency: 'USD', liveUsd: 869341, liveMon: 7073, liveYld: 9.76 },
  { id: 3, name: 'SAFE', currency: 'USD', liveUsd: 0, liveMon: 0, liveYld: 0 }
];

export function financeData() {
  return readJson(keys.financeCache, { data: financeFallback }).data || financeFallback;
}

export function financeStats() {
  const data = financeData();
  const summary = data.summary || {};
  const income = number(summary.income?.total);
  const expenses = number(summary.expenses?.total);
  const passive = number(summary.passive?.total);
  return {
    data, income, expenses, passive, balance: income - expenses,
    monthlyIncome: months.map(month => number(summary.income?.[month])),
    monthlyExpenses: months.map(month => number(summary.expenses?.[month]))
  };
}

export function timeStats(day = dateKey()) {
  const data = readJson(keys.time, {});
  const categories = readJson(keys.timeCategories, defaultTimeCategories);
  const current = data[day] || {};
  const total = sum(Object.values(current));
  const work = sum(categories.filter(category => category.work).map(category => current[category.key] || 0));
  const recent = Object.keys(data).sort().slice(-7).map(key => sum(Object.values(data[key] || {})));
  return { data, categories, current, total, work, personal: total - work, recent };
}

function itemText(item) {
  if (typeof item === 'string') return item;
  if (item?.text) return item.text;
  return Array.isArray(item?.words) ? item.words.map(word => word.t || '').join(' ') : 'Без названия';
}

export function morningModel() {
  const blocks = readJson(keys.morningBlocks, defaultMorningBlocks);
  const state = readJson(keys.morningState, {});
  let done = 0, total = 0;
  const normalized = blocks.map(block => ({
    ...block,
    items: (block.items || []).map(item => {
      const checked = Boolean(state[block.id]?.items?.[item.id]);
      total += 1;
      if (checked) done += 1;
      return { ...item, label: itemText(item), checked };
    })
  }));
  return { blocks: normalized, state, done, total, progress: total ? (done / total) * 100 : 0 };
}

export function capitalRows(cacheKey, sheetNames = []) {
  const payload = readJson(cacheKey, null)?.data || {};
  const sheetName = sheetNames.find(name => Array.isArray(payload[name])) || Object.keys(payload).find(name => Array.isArray(payload[name]));
  const rows = sheetName ? payload[sheetName] : [];
  const clean = rows.filter(row => !/итого/i.test(String(row['АКТИВ'] || row['ФИО'] || '')));
  const totalRow = rows.find(row => /итого/i.test(String(row['АКТИВ'] || row['ФИО'] || '')));
  const amount = number(totalRow?.['СУММА']) || sum(clean.map(row => row['СУММА']));
  const monthly = number(totalRow?.['МЕСЯЦ'] ?? totalRow?.['МЕС']) || sum(clean.map(row => row['МЕСЯЦ'] ?? row['МЕС']));
  const annual = amount ? (monthly * 12 / amount) * 100 : 0;
  return { rows: clean, amount, monthly, annual, sheetName };
}

export function fundsModel() {
  const stored = readJson(keys.funds, defaultFunds);
  const list = Array.isArray(stored) && stored.length ? stored : defaultFunds;
  return list.filter(fund => !/finance\s*os|personal/i.test(String(fund.name))).map(fund => ({
    ...fund,
    amount: number(fund.liveUsd ?? fund.snapshotUsd ?? fund.usd ?? fund.usdM),
    monthly: number(fund.liveMon ?? fund.snapshotMon ?? fund.monthly),
    yield: number(fund.liveYld ?? fund.snapshotYld ?? fund.yld)
  }));
}

export function genericProgress(value) {
  const visited = new WeakSet();
  let done = 0, total = 0;
  function walk(node) {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    if ('done' in node || 'completed' in node || 'checked' in node) {
      total += 1;
      if (node.done || node.completed || node.checked) done += 1;
    }
    Object.values(node).forEach(walk);
  }
  walk(value);
  return { done, total, percent: total ? done / total * 100 : 0 };
}
