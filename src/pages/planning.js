import { escapeHtml, number, sum } from '../core/format.js';
import { kpi, pageHeader, progress } from '../core/ui.js';
import { keys, readJson, writeJson } from '../core/storage.js';
import { genericProgress } from '../data/models.js';

let activeTab = 'weekly';
const weeklySeed = [185, 860, 185, 460, 815, 130, 2545, 1135, 1670, 760, 550, 150];
const dynamics = ['Я сам', 'Семья', 'Группы и проекты', 'Общество', 'Жизнь', 'Материальное', 'Духовное', 'Абсолют'];

function tabs() {
  return `<nav class="section-tabs">
    <button data-tab="weekly" class="${activeTab === 'weekly' ? 'active' : ''}">ПС №1</button>
    <button data-tab="admin" class="${activeTab === 'admin' ? 'active' : ''}">Админ-шкала</button>
    <button data-tab="roadmap" class="${activeTab === 'roadmap' ? 'active' : ''}">Мои динамики</button>
  </nav>`;
}

function weeklyModel() {
  const state = readJson(keys.weekly, {});
  const tasks = Array.isArray(state.tasks) ? state.tasks.filter(task => task.active !== false) : [];
  const counts = state.counts || {};
  const current = tasks.length ? sum(tasks.map(task => number(counts[task.id]) * number(task.w))) : weeklySeed.at(-1);
  const history = Array.isArray(state.history) && state.history.length
    ? state.history.map(week => number(week.snapshotTotal ?? week.total))
    : weeklySeed;
  return { state, tasks, counts, current, history, average: history.length ? sum(history) / history.length : 0 };
}

function weeklyView() {
  const model = weeklyModel();
  const max = Math.max(...model.history, model.current, 1);
  return `<section class="page-section">
    <div class="kpi-grid thirds">
      ${kpi('Эта неделя', `${model.current.toLocaleString('ru-RU')} баллов`, 'Текущий результат', [...model.history.slice(-5), model.current])}
      ${kpi('Среднее', `${Math.round(model.average).toLocaleString('ru-RU')} баллов`, `${model.history.length} недель истории`)}
      ${kpi('Лучший результат', `${Math.max(...model.history).toLocaleString('ru-RU')} баллов`, 'За весь период')}
    </div>
    <div class="dashboard-grid">
      <article class="panel span-2"><div class="panel-head"><div><span class="eyebrow">История</span><h2>Недельная динамика</h2></div></div>
        <div class="weekly-bars">${model.history.map((value, index) => `<div title="${value} баллов"><i style="height:${Math.max(3, value / max * 100)}%"></i><span>${index + 1}</span></div>`).join('')}</div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">Задачи</span><h2>Баллы недели</h2></div></div>
        ${model.tasks.length ? `<div class="score-list">${model.tasks.slice(0, 10).map(task => `<div><span>${escapeHtml(task.name)}</span><b>${number(model.counts[task.id]) * number(task.w)}</b></div>`).join('')}</div>` : '<div class="empty compact"><strong>История сохранена</strong><p>Добавление задач доступно в исходных данных ПС №1.</p></div>'}
      </article>
    </div>
  </section>`;
}

function adminView() {
  const db = readJson(keys.admin, {});
  const allProgress = genericProgress(db);
  return `<section class="page-section">
    <div class="focus-banner"><div><span class="eyebrow">Управление</span><h2>8 динамик</h2><p>Цели, программы и планы собраны в одном контуре</p></div><strong>${Math.round(allProgress.percent)}%</strong></div>
    <div class="dynamic-grid">${dynamics.map((name, index) => {
      const section = db[index + 1] || {};
      const items = ['цели', 'проги', 'планы'].flatMap(kind => Array.isArray(section[kind]) ? section[kind].map(item => ({ ...item, kind })) : []);
      const done = items.filter(item => item.done).length;
      return `<article class="panel dynamic-card"><div class="dynamic-number">${String(index + 1).padStart(2, '0')}</div><div><h2>${escapeHtml(name)}</h2><p>${items.length ? `${done} из ${items.length} выполнено` : 'Готово к наполнению'}</p></div>${progress(items.length ? done / items.length * 100 : 0)}</article>`;
    }).join('')}</div>
  </section>`;
}

function roadmapView() {
  const stored = readJson(keys.roadmap, []);
  const cells = readJson('roadmap_cells_v1', {});
  const items = Array.isArray(stored) && stored.length ? stored : dynamics.map((title, index) => ({ n: index + 1, title, items: [] }));
  return `<section class="page-section"><article class="panel"><div class="panel-head"><div><span class="eyebrow">Дорожная карта</span><h2>Состояние динамик</h2></div><span class="status-dot">Шкала 0–10</span></div>
    <div class="roadmap-list">${items.map((dynamic, index) => {
      const values = (dynamic.items || []).map(item => number(cells[item.id]?.[2026] ?? cells[item.id] ?? ({ red: 2, yellow: 5, green: 8 }[item.base] || 0))).filter(Boolean);
      const value = values.length ? sum(values) / values.length : 0;
      return `<div class="roadmap-row"><span class="dynamic-number">${dynamic.n || index + 1}</span><div class="row-main"><b>${escapeHtml(dynamic.title || dynamics[index] || 'Динамика')}</b><small>${dynamic.items?.length || 0} направлений</small></div><div class="roadmap-control"><input type="range" min="0" max="10" step="1" value="${Math.round(value)}" data-roadmap="${index}" disabled/><b>${value ? value.toFixed(1) : '—'}</b></div></div>`;
    }).join('')}</div>
  </article></section>`;
}

export function renderPlanning() {
  const body = activeTab === 'admin' ? adminView() : activeTab === 'roadmap' ? roadmapView() : weeklyView();
  return `${pageHeader('Развитие', 'Планирование', 'Недельный результат, цели и восемь динамик')}${tabs()}${body}`;
}

export function mountPlanning(root, rerender) {
  root.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    rerender();
  }));
}
