import { endpoints, refreshCached } from '../core/api.js';
import { escapeHtml, money, number, percent, sum } from '../core/format.js';
import { icon, kpi, pageHeader, progress } from '../core/ui.js';
import { keys } from '../core/storage.js';
import { capitalRows, fundsModel } from '../data/models.js';

let activeTab = 'structure';
const configs = {
  pff: { title: 'Piura Family Fund', currency: 'USD', cache: keys.pffCache, endpoint: endpoints.pff, sheets: ['2026 (PFF)'] },
  moscow: { title: 'Фонд Москва', currency: 'RUB', cache: keys.moscowCache, endpoint: endpoints.moscow, sheets: ['2026 (НЕД)'] },
  safe: { title: 'SAFE', currency: 'USD', cache: keys.safeCache, endpoint: endpoints.safe, sheets: ['SAFE', '2026 (SAFE)', '2026 (НЕД)'] }
};

function tabs() {
  return `<nav class="section-tabs">
    <button data-tab="structure" class="${activeTab === 'structure' ? 'active' : ''}">Структура</button>
    <button data-tab="pff" class="${activeTab === 'pff' ? 'active' : ''}">PFF</button>
    <button data-tab="moscow" class="${activeTab === 'moscow' ? 'active' : ''}">Москва</button>
    <button data-tab="safe" class="${activeTab === 'safe' ? 'active' : ''}">SAFE</button>
  </nav>`;
}

function structureView() {
  const funds = fundsModel();
  const capital = sum(funds.map(fund => fund.amount));
  const monthly = sum(funds.map(fund => fund.monthly));
  const annual = capital ? monthly * 12 / capital * 100 : 0;
  return `<section class="page-section">
    <div class="kpi-grid thirds">
      ${kpi('Общий капитал', money(capital, 'USD'), `${funds.length} фонда`, funds.map(f => f.amount))}
      ${kpi('Доход в месяц', money(monthly, 'USD'), 'По активным портфелям', funds.map(f => f.monthly))}
      ${kpi('Доходность', percent(annual, 1), 'Средневзвешенная годовая')}
    </div>
    <article class="panel"><div class="panel-head"><div><span class="eyebrow">Иерархия</span><h2>Фонды</h2></div><span class="status-dot">Единая модель</span></div>
      <div class="fund-table"><div class="table-head"><span>Фонд</span><span>Капитал</span><span>Доход / мес.</span><span>Доходность</span></div>
      ${funds.map((fund, index) => `<button class="table-row" data-open-fund="${index === 0 ? 'moscow' : index === 1 ? 'pff' : 'safe'}"><span><i class="fund-index">${String(index + 1).padStart(2, '0')}</i><b>${escapeHtml(fund.name)}</b></span><strong>${money(fund.amount, 'USD')}</strong><strong>${money(fund.monthly, 'USD')}</strong><span>${percent(fund.yield, 1)} ${icon('arrow')}</span></button>`).join('')}</div>
    </article>
  </section>`;
}

function portfolioView(key) {
  const config = configs[key];
  const model = capitalRows(config.cache, config.sheets);
  const byType = new Map();
  model.rows.forEach(row => {
    const type = String(row['ТИП'] || 'Прочее');
    byType.set(type, (byType.get(type) || 0) + number(row['СУММА']));
  });
  const allocation = [...byType.entries()].sort((a, b) => b[1] - a[1]);
  return `<section class="page-section">
    <div class="kpi-grid thirds">
      ${kpi('Капитал', money(model.amount, config.currency), `${model.rows.length} активов`, allocation.map(([, value]) => value))}
      ${kpi('Доход в месяц', money(model.monthly, config.currency), 'Активный портфель')}
      ${kpi('Доходность', percent(model.annual, 1), 'Расчётная годовая')}
    </div>
    <div class="dashboard-grid">
      <article class="panel span-2"><div class="panel-head"><div><span class="eyebrow">Портфель</span><h2>${escapeHtml(config.title)}</h2></div><button class="button ghost" id="refreshPortfolio">${icon('refresh')} Обновить</button></div>
        ${model.rows.length ? `<div class="asset-table"><div class="table-head"><span>Актив</span><span>Тип</span><span>Сумма</span><span>Доля</span></div>${model.rows.slice(0, 20).map(row => {
          const name = row['АКТИВ'] || row['ФИО'] || 'Актив';
          const amount = number(row['СУММА']);
          return `<div class="table-row static"><span><b>${escapeHtml(name)}</b><small>${escapeHtml(row['Риск'] || row['РИСК'] || '')}</small></span><span>${escapeHtml(row['ТИП'] || '—')}</span><strong>${money(amount, config.currency)}</strong><span>${percent(model.amount ? amount / model.amount * 100 : 0, 1)}</span></div>`;
        }).join('')}</div>` : `<div class="empty"><span class="empty-mark">—</span><strong>Нет сохранённого снимка</strong><p>Нажмите «Обновить», чтобы получить данные из Google Sheets.</p></div>`}
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">Структура</span><h2>Распределение</h2></div></div>
        <div class="allocation-list">${allocation.length ? allocation.map(([type, amount]) => `<div><div><span>${escapeHtml(type)}</span><b>${percent(model.amount ? amount / model.amount * 100 : 0, 1)}</b></div>${progress(model.amount ? amount / model.amount * 100 : 0)}</div>`).join('') : '<p class="muted-text">Данные появятся после обновления.</p>'}</div>
      </article>
    </div>
  </section>`;
}

export function renderCapital() {
  const body = activeTab === 'structure' ? structureView() : portfolioView(activeTab);
  return `${pageHeader('Капитал', 'Фонды', 'Три портфеля в одной понятной финансовой структуре')}${tabs()}${body}`;
}

export function mountCapital(root, rerender) {
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    rerender();
  }));
  root.querySelectorAll('[data-open-fund]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.openFund;
    rerender();
  }));
  root.querySelector('#refreshPortfolio')?.addEventListener('click', async event => {
    const config = configs[activeTab];
    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add('loading');
    try { await refreshCached(config.endpoint, config.cache); } catch (error) { button.textContent = error.message; }
    rerender();
  });
}
