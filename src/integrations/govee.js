import { keys, readJson } from '../core/storage.js';
import { getJson } from '../core/api.js';

function validUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function goveeConfig() {
  const settings = readJson(keys.serviceSettings, {});
  const cloud = readJson(keys.cloud, {});
  const explicit = validUrl(settings.overview?.goveeUrl);
  const shared = validUrl(cloud.url);
  const url = explicit || shared;
  if (!url) return { configured: false, url: '', token: '' };
  const token = String(cloud.token || settings.overview?.goveeToken || '').trim();
  return { configured: true, url: url.toString(), token };
}

function actionUrl(action, parameters = {}) {
  const config = goveeConfig();
  if (!config.configured) throw new Error('Govee не настроен');
  const url = new URL(config.url);
  url.searchParams.set('action', action);
  if (config.token) url.searchParams.set('token', config.token);
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

export async function loadGovee() {
  const data = await getJson(actionUrl('govee'));
  if (data?.ok === false) throw new Error(data.error || 'Govee недоступен');
  return data;
}

export async function controlGovee(command, value) {
  const data = await getJson(actionUrl('goveeControl', { command, value }));
  if (data?.ok === false) throw new Error(data.error || 'Команда не выполнена');
  return data;
}
