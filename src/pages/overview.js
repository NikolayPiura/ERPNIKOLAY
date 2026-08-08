import { endpoints, refreshCached } from '../core/api.js';
import { duration, money, percent, sum } from '../core/format.js';
import { icon, kpi, pageHeader, progress } from '../core/ui.js';
import { keys } from '../core/storage.js';
import { financeStats, fundsModel, morningModel, timeStats } from '../data/models.js';
import { controlGovee, goveeConfig, loadGovee } from '../integrations/govee.js';

function fundCards(funds) {
  return funds.slice(0, 4).map(fund => `
    <button class="data-row route-button" data-route="capital">
      <span class="row-symbol">${String(fund.name || 'F').slice(0, 2).toUpperCase()}</span>
      <span class="row-main"><b>${fund.name}</b><small>${percent(fund.yield, 1)} годовых</small></span>
      <strong>${money(fund.amount, 'USD')}</strong>
      ${icon('arrow')}
    </button>`).join('');
}

export function renderOverview() {
  const finance = financeStats();
  const funds = fundsModel();
  const time = timeStats();
  const morning = morningModel();
  const capital = sum(funds.map(fund => fund.amount));
  const plan = finance.data.sources?.planYear || 360000;
  const config = goveeConfig();

  return `
    ${pageHeader('PIURA ERP', 'Главная', 'Вся система в одном спокойном и точном пространстве', `<button class="button ghost" id="refreshOverview">${icon('refresh')} Обновить</button>`)}
    <section class="kpi-grid">
      ${kpi('Капитал фондов', money(capital, 'USD'), `${funds.length} активных фонда`, funds.map(f => f.amount))}
      ${kpi('Доход за год', money(finance.income, 'USD'), `${Math.round(finance.income / plan * 100)}% годового плана`, finance.monthlyIncome.filter(Boolean))}
      ${kpi('Баланс', money(finance.balance, 'USD'), finance.balance >= 0 ? 'Положительный поток' : 'Расходы выше дохода', finance.monthlyIncome.map((v, i) => v - finance.monthlyExpenses[i]).filter(Boolean))}
      ${kpi('Фокус сегодня', `${duration(time.work)} ч`, `${morning.done} из ${morning.total} пунктов утра`, time.recent)}
    </section>

    <section class="dashboard-grid">
      <article class="panel span-2">
        <div class="panel-head"><div><span class="eyebrow">Капитал</span><h2>Структура фондов</h2></div><button class="text-button route-button" data-route="capital">Все фонды ${icon('arrow')}</button></div>
        <div class="data-list">${fundCards(funds)}</div>
      </article>

      <article class="panel lamp-card" id="goveeCard">
        <div class="panel-head"><div><span class="eyebrow">Пространство</span><h2>Govee Life</h2></div><span class="status-dot" id="goveeStatus">${config.configured ? 'Связь' : 'Не настроено'}</span></div>
        <div class="lamp-state">
          <button class="lamp-toggle" id="lampPower" ${config.configured ? '' : 'disabled'} aria-label="Включить или выключить лампу">${icon('bulb')}</button>
          <div><strong id="lampLabel">${config.configured ? 'Получаем состояние…' : 'Подключите адрес в настройках'}</strong><small id="climateLabel">Температура и влажность</small></div>
        </div>
        <label class="range-label" for="lampBrightness"><span>Яркость</span><b id="brightnessValue">—</b></label>
        <input type="range" id="lampBrightness" min="1" max="100" value="50" ${config.configured ? '' : 'disabled'} />
        <button class="text-button route-button settings-link" data-route="settings">Настройки устройства ${icon('arrow')}</button>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="eyebrow">Сегодня</span><h2>Утренний запуск</h2></div><strong class="metric-small">${Math.round(morning.progress)}%</strong></div>
        ${progress(morning.progress, `${morning.done} из ${morning.total} выполнено`)}
        <div class="mini-list">${morning.blocks.slice(0, 3).map(block => {
          const done = block.items.filter(item => item.checked).length;
          return `<div><span>${block.name}</span><b>${done}/${block.items.length}</b></div>`;
        }).join('')}</div>
        <button class="button secondary full route-button" data-route="performance">Продолжить утро</button>
      </article>

      <article class="panel">
        <div class="panel-head"><div><span class="eyebrow">Деньги</span><h2>Годовой план</h2></div><strong class="metric-small">${Math.round(finance.income / plan * 100)}%</strong></div>
        ${progress(finance.income / plan * 100, `${money(finance.income, 'USD')} из ${money(plan, 'USD')}`)}
        <div class="split-stats"><div><span>Доход</span><b>${money(finance.income, 'USD')}</b></div><div><span>Расходы</span><b>${money(finance.expenses, 'USD')}</b></div></div>
        <button class="button secondary full route-button" data-route="income">Открыть финансы</button>
      </article>
    </section>`;
}

export function mountOverview(root, rerender, navigate) {
  root.querySelectorAll('.route-button').forEach(button => button.addEventListener('click', () => navigate(button.dataset.route)));
  root.querySelector('#refreshOverview')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.classList.add('loading');
    await Promise.allSettled([
      refreshCached(endpoints.finance, keys.financeCache),
      refreshCached(endpoints.pff, keys.pffCache),
      refreshCached(endpoints.moscow, keys.moscowCache),
      refreshCached(endpoints.safe, keys.safeCache),
      loadGovee()
    ]);
    rerender();
  });

  const power = root.querySelector('#lampPower');
  const brightness = root.querySelector('#lampBrightness');
  const label = root.querySelector('#lampLabel');
  const climate = root.querySelector('#climateLabel');
  const status = root.querySelector('#goveeStatus');
  const brightnessValue = root.querySelector('#brightnessValue');
  let lampOn = false;
  let brightnessTimer;

  const setBusy = busy => {
    if (power) power.disabled = busy;
    if (brightness) brightness.disabled = busy;
  };
  if (goveeConfig().configured) {
    loadGovee().then(data => {
      lampOn = Boolean(data.power);
      power?.classList.toggle('is-on', lampOn);
      label.textContent = data.lightName || (lampOn ? 'Лампа включена' : 'Лампа выключена');
      status.textContent = data.online === false ? 'Офлайн' : 'На связи';
      climate.textContent = [data.temperature != null ? `${Number(data.temperature).toFixed(1)}°C` : '', data.humidity != null ? `${Math.round(data.humidity)}%` : ''].filter(Boolean).join(' · ') || 'Климат недоступен';
      if (data.brightness != null) brightness.value = data.brightness;
      brightnessValue.textContent = `${brightness.value}%`;
      setBusy(false);
    }).catch(error => {
      label.textContent = error.message;
      status.textContent = 'Нет связи';
      setBusy(false);
    });
  }

  power?.addEventListener('click', async () => {
    setBusy(true);
    try {
      lampOn = !lampOn;
      await controlGovee('power', lampOn ? 'on' : 'off');
      power.classList.toggle('is-on', lampOn);
      label.textContent = lampOn ? 'Лампа включена' : 'Лампа выключена';
    } catch (error) {
      lampOn = !lampOn;
      label.textContent = error.message;
    } finally { setBusy(false); }
  });

  brightness?.addEventListener('input', () => {
    brightnessValue.textContent = `${brightness.value}%`;
    clearTimeout(brightnessTimer);
    brightnessTimer = setTimeout(async () => {
      try {
        await controlGovee('brightness', brightness.value);
        if (!lampOn) {
          lampOn = true;
          power?.classList.add('is-on');
        }
        label.textContent = 'Яркость изменена';
      } catch (error) { label.textContent = error.message; }
    }, 350);
  });
}
