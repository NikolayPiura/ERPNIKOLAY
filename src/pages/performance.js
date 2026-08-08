import { dateKey, duration, escapeHtml, money, percent, sum } from '../core/format.js';
import { kpi, pageHeader, progress } from '../core/ui.js';
import { keys, readJson, writeJson } from '../core/storage.js';
import { financeStats, morningModel, timeStats } from '../data/models.js';

let activeTab = 'effectiveness';

function tabs() {
  return `<nav class="section-tabs" aria-label="Разделы эффективности">
    <button data-tab="effectiveness" class="${activeTab === 'effectiveness' ? 'active' : ''}">Обзор</button>
    <button data-tab="morning" class="${activeTab === 'morning' ? 'active' : ''}">Утро</button>
    <button data-tab="time" class="${activeTab === 'time' ? 'active' : ''}">Учёт времени</button>
  </nav>`;
}

function effectivenessView() {
  const finance = financeStats();
  const time = timeStats();
  const morning = morningModel();
  const hourly = time.work ? finance.income / Math.max(1, time.work / 60) : 0;
  return `<section class="page-section">
    <div class="kpi-grid thirds">
      ${kpi('Доход', money(finance.income, 'USD'), 'Текущий год', finance.monthlyIncome.filter(Boolean))}
      ${kpi('Рабочее время', `${duration(time.work)} ч`, 'Сегодня', time.recent)}
      ${kpi('Доход на час', money(hourly, 'USD'), 'По доступным данным')}
    </div>
    <div class="dashboard-grid">
      <article class="panel span-2"><div class="panel-head"><div><span class="eyebrow">Динамика</span><h2>Доход и расходы</h2></div><span class="status-dot">2026</span></div>
        <div class="month-chart">${finance.monthlyIncome.map((income, index) => {
          const expense = finance.monthlyExpenses[index] || 0;
          const max = Math.max(...finance.monthlyIncome, ...finance.monthlyExpenses, 1);
          return `<div class="month-column" title="Доход ${money(income, 'USD')} · Расход ${money(expense, 'USD')}"><div class="bars"><i style="height:${income / max * 100}%"></i><i class="muted" style="height:${expense / max * 100}%"></i></div><span>${['Я','Ф','М','А','М','И','И','А','С','О','Н','Д'][index]}</span></div>`;
        }).join('')}</div>
        <div class="legend"><span><i></i> Доход</span><span><i class="muted"></i> Расход</span></div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">Ритм</span><h2>Готовность дня</h2></div><strong class="metric-small">${Math.round(morning.progress)}%</strong></div>
        ${progress(morning.progress, `${morning.done} из ${morning.total}`)}
        <div class="split-stats"><div><span>Работа</span><b>${duration(time.work)}</b></div><div><span>Личное</span><b>${duration(time.personal)}</b></div></div>
      </article>
    </div>
  </section>`;
}

function morningView() {
  const model = morningModel();
  return `<section class="page-section">
    <div class="focus-banner"><div><span class="eyebrow">Сегодня</span><h2>${model.done === model.total && model.total ? 'Утро завершено' : 'Спокойный старт дня'}</h2><p>${model.done} из ${model.total} пунктов выполнено</p></div><strong>${Math.round(model.progress)}%</strong></div>
    <div class="checklist-grid">${model.blocks.map(block => `
      <article class="panel checklist-card"><div class="panel-head"><div><span class="eyebrow">${block.items.filter(i => i.checked).length}/${block.items.length}</span><h2>${escapeHtml(block.name)}</h2></div></div>
        <div class="checklist">${block.items.map(item => `<label><input type="checkbox" data-block="${escapeHtml(block.id)}" data-item="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''}/><span class="check-box"></span><span>${escapeHtml(item.label)}</span></label>`).join('')}</div>
      </article>`).join('')}</div>
  </section>`;
}

function timeView() {
  const model = timeStats();
  return `<section class="page-section">
    <div class="kpi-grid thirds">
      ${kpi('Всего сегодня', `${duration(model.total)} ч`, new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }), model.recent)}
      ${kpi('Рабочее', `${duration(model.work)} ч`, percent(model.total ? model.work / model.total * 100 : 0) + ' времени')}
      ${kpi('Личное', `${duration(model.personal)} ч`, 'Вне рабочих категорий')}
    </div>
    <article class="panel"><div class="panel-head"><div><span class="eyebrow">Категории</span><h2>Распределение дня</h2></div><span class="status-dot">Сохраняется автоматически</span></div>
      <div class="time-list">${model.categories.map(category => {
        const minutes = model.current[category.key] || 0;
        return `<div class="time-row"><span class="row-symbol">${escapeHtml(category.label.slice(0, 1))}</span><div class="row-main"><b>${escapeHtml(category.label)}</b><small>${category.work ? 'Рабочее' : 'Личное'}</small></div><strong>${duration(minutes)}</strong><div class="time-actions"><button data-time="${category.key}" data-delta="-30">−</button><button data-time="${category.key}" data-delta="30">+</button></div></div>`;
      }).join('')}</div>
    </article>
  </section>`;
}

export function renderPerformance() {
  const body = activeTab === 'morning' ? morningView() : activeTab === 'time' ? timeView() : effectivenessView();
  return `${pageHeader('Личная эффективность', 'Эффективность', 'Доход, время и ежедневный фокус в единой системе')}${tabs()}${body}`;
}

export function mountPerformance(root, rerender) {
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    rerender();
  }));

  root.querySelectorAll('[data-block][data-item]').forEach(input => input.addEventListener('change', () => {
    const state = readJson(keys.morningState, {});
    const block = input.dataset.block;
    const item = input.dataset.item;
    if (!state[block]) state[block] = { confirmed: false, items: {} };
    if (!state[block].items) state[block].items = {};
    state[block].items[item] = input.checked;
    writeJson(keys.morningState, state);
    rerender();
  }));

  root.querySelectorAll('[data-time]').forEach(button => button.addEventListener('click', () => {
    const all = readJson(keys.time, {});
    const day = dateKey();
    if (!all[day]) all[day] = {};
    const key = button.dataset.time;
    all[day][key] = Math.max(0, (Number(all[day][key]) || 0) + Number(button.dataset.delta));
    if (!all[day][key]) delete all[day][key];
    writeJson(keys.time, all);
    rerender();
  }));
}
