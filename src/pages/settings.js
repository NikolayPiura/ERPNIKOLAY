import { icon, pageHeader } from '../core/ui.js';
import { escapeHtml } from '../core/format.js';
import { keys, readJson, writeJson } from '../core/storage.js';

export function renderSettings() {
  const theme = localStorage.getItem(keys.theme) || 'dark';
  const density = localStorage.getItem(keys.density) || 'comfortable';
  const settings = readJson(keys.serviceSettings, {});
  const cloud = readJson(keys.cloud, {});
  const govee = settings.overview || {};
  return `${pageHeader('Система', 'Настройки', 'Только необходимые параметры единой ERP')}
    <section class="settings-layout">
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">Интерфейс</span><h2>Внешний вид</h2></div></div>
        <div class="theme-options">
          <label class="theme-option dark-preview"><input type="radio" name="theme" value="dark" ${theme === 'dark' ? 'checked' : ''}/><span><b>Premium Dark</b><small>Глубокий графит и спокойный контраст</small></span></label>
          <label class="theme-option light-preview"><input type="radio" name="theme" value="light" ${theme === 'light' ? 'checked' : ''}/><span><b>Light</b><small>Белый, лёгкий и максимально понятный</small></span></label>
        </div>
        <div class="setting-row"><div><b>Плотность</b><small>Размер карточек и отступов</small></div><select id="density"><option value="comfortable" ${density === 'comfortable' ? 'selected' : ''}>Комфортная</option><option value="compact" ${density === 'compact' ? 'selected' : ''}>Компактная</option></select></div>
      </article>
      <article class="panel"><div class="panel-head"><div><span class="eyebrow">Интеграция</span><h2>Govee Life</h2></div></div>
        <p class="form-note">Укажите полный защищённый адрес Google Apps Script, заканчивающийся на /exec. API-ключ Govee остаётся только в Script Properties и не попадает в ERP.</p>
        <label class="field"><span>Адрес Apps Script</span><input id="goveeUrl" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${escapeHtml(govee.goveeUrl || cloud.url || '')}"/></label>
        <label class="field"><span>Токен синхронизации</span><input id="syncToken" type="password" placeholder="Необязательно" value="${escapeHtml(cloud.token || '')}"/></label>
        <button class="button primary" id="saveIntegration">Сохранить подключение</button><span class="save-status" id="saveStatus"></span>
      </article>
      <article class="panel full-width"><div class="panel-head"><div><span class="eyebrow">Архитектура</span><h2>Единое приложение</h2></div></div>
        <div class="architecture-strip"><div><b>1</b><span>корневой экран</span></div><div><b>5</b><span>основных разделов</span></div><div><b>0</b><span>iframe и дублирующих index</span></div><div><b>2</b><span>цельные темы</span></div></div>
      </article>
    </section>`;
}

export function mountSettings(root, rerender, navigate, applyAppearance) {
  root.querySelectorAll('[name="theme"]').forEach(input => input.addEventListener('change', () => {
    localStorage.setItem(keys.theme, input.value);
    applyAppearance();
    rerender();
  }));
  root.querySelector('#density')?.addEventListener('change', event => {
    localStorage.setItem(keys.density, event.target.value);
    applyAppearance();
  });
  root.querySelector('#saveIntegration')?.addEventListener('click', () => {
    const url = root.querySelector('#goveeUrl').value.trim();
    const token = root.querySelector('#syncToken').value.trim();
    const settings = readJson(keys.serviceSettings, {});
    settings.overview = { ...(settings.overview || {}), goveeUrl: url };
    writeJson(keys.serviceSettings, settings);
    writeJson(keys.cloud, { ...readJson(keys.cloud, {}), url, token });
    const status = root.querySelector('#saveStatus');
    status.textContent = 'Сохранено';
    setTimeout(() => { status.textContent = ''; }, 1800);
  });
}
