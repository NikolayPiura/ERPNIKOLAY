import { endpoints, refreshCached } from '../core/api.js';
import { escapeHtml, money, months, percent } from '../core/format.js';
import { icon, kpi, pageHeader, progress } from '../core/ui.js';
import { keys } from '../core/storage.js';
import { financeStats } from '../data/models.js';

export function renderIncome() {
  const model = financeStats();
  const data = model.data;
  const plan = Number(data.sources?.planYear) || 360000;
  const sources = Array.isArray(data.sources?.sources) ? data.sources.sources : [];
  return `
    ${pageHeader('Личные финансы', 'Доходы', 'Доход, расходы и годовой план без лишнего финансового сервиса', `<button class="button ghost" id="refreshIncome">${icon('refresh')} Обновить</button>`)}
    <section class="kpi-grid">
      ${kpi('Доход', money(model.income, 'USD'), 'С начала года', model.monthlyIncome.filter(Boolean))}
      ${kpi('Расходы', money(model.expenses, 'USD'), percent(model.income ? model.expenses / model.income * 100 : 0) + ' от дохода', model.monthlyExpenses.filter(Boolean))}
      ${kpi('Пассивный доход', money(model.passive, 'USD'), percent(model.income ? model.passive / model.income * 100 : 0) + ' дохода')}
      ${kpi('Свободный поток', money(model.balance, 'USD'), model.balance >= 0 ? 'Положительный' : 'Отрицательный')}
    </section>
    <section class="dashboard-grid">
      <article class="panel span-2"><div class="panel-head"><div><span class="eyebrow">2026</span><h2>По месяцам</h2></div><span class="status-dot">${escapeHtml(data.meta?.updated || 'Сохранённые данные')}</span></div>
        <div class="finance-months">${months.map((month, index) => {
          const income = model.monthlyIncome[index];
          const expense = model.monthlyExpenses[index];
          return `<div class="finance-month ${income ? 'active' : ''}"><span>${month}</span><b>${income ? money(income, 'USD') : '—'}</b><small>${expense ? `− ${money(expense, 'USD')}` : 'Нет данных'}</small></div>`;
        }).join('')}</div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">План</span><h2>Годовая цель</h2></div><strong class="metric-small">${Math.round(model.income / plan * 100)}%</strong></div>
        ${progress(model.income / plan * 100, `${money(model.income, 'USD')} из ${money(plan, 'USD')}`)}
        <div class="split-stats"><div><span>Осталось</span><b>${money(Math.max(0, plan - model.income), 'USD')}</b></div><div><span>План / мес.</span><b>${money(plan / 12, 'USD')}</b></div></div>
      </article>
      <article class="panel full-width"><div class="panel-head"><div><span class="eyebrow">Источники</span><h2>Структура дохода</h2></div></div>
        <div class="source-grid">${sources.sort((a, b) => b.total - a.total).map(source => `<div><span>${escapeHtml(source.name)}</span><strong>${money(source.total, 'USD')}</strong>${progress(model.income ? source.total / model.income * 100 : 0)}</div>`).join('')}</div>
      </article>
    </section>`;
}

export function mountIncome(root, rerender) {
  root.querySelector('#refreshIncome')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add('loading');
    try { await refreshCached(endpoints.finance, keys.financeCache); } catch (error) { button.textContent = error.message; }
    rerender();
  });
}
