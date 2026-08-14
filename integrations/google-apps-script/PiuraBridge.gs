/**
 * PIURA ERP · Google Docs ↔ Admin Scale
 * Deploy as a Google Apps Script Web App (execute as yourself).
 * Access is verified by the signed-in Firebase owner automatically.
 * A Script Property SYNC_TOKEN remains supported only as an emergency override.
 */
const PIURA_DOCS = {
  'цели': '14LSlYVFN0NZFMw0a-50jEexXjvPf--1KvBVprMK058c',
  'планы': '1J5wux0DZxyQkYwOKkUkBQjgAcPoMp4Fcyq1HC5wOUfM',
  'проги': '1d9I_5iUwRWL5O3o-RmcFjYxUQviq0gjhWdTqNelTUEM'
};

function doGet(e) {
  try {
    authorize_(e.parameter.token);
    const action = e.parameter.action || 'snapshot';
    if (action === 'snapshot') return json_({ok: true, items: snapshot_(), at: new Date().toISOString()});
    if (action === 'govee') return json_(goveeOverview_());
    if (action === 'goveeControl') return json_(goveeControl_(e.parameter));
    throw new Error('Unknown action');
  } catch (error) {
    return json_({ok: false, error: String(error.message || error)});
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    authorize_(e.parameter.token);
    const p = e.parameter;
    const section = p.section;
    if (!PIURA_DOCS[section]) throw new Error('Unknown section');
    const doc = DocumentApp.openById(PIURA_DOCS[section]);
    const body = doc.getBody();
    const item = findItem_(body, p.text || '');

    if (p.action === 'setDone') {
      if (!item) throw new Error('Item was not found in Docs');
      setDone_(item, p.done === 'true');
    } else if (p.action === 'renameItem') {
      const next = String(p.newText || '').trim();
      if (!next) throw new Error('New text is empty');
      if (item) item.editAsText().setText(next);
      else appendToDynamic_(body, Number(p.dyn), next);
    } else if (p.action === 'deleteItem') {
      if (item) item.removeFromParent();
    } else {
      throw new Error('Unknown action');
    }
    doc.saveAndClose();
    return json_({ok: true});
  } catch (error) {
    return json_({ok: false, error: String(error.message || error)});
  } finally {
    lock.releaseLock();
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * GOVEE LIFE
 * Script Properties:
 *   GOVEE_API_KEY        — required
 *   GOVEE_SENSOR_DEVICE  — optional MAC for climate sensor
 *   GOVEE_SENSOR_SKU     — optional sensor SKU
 *   GOVEE_LIGHT_DEVICE   — optional MAC for lamp
 *   GOVEE_LIGHT_SKU      — optional lamp SKU
 * The API key is never returned to the ERP.
 * ═══════════════════════════════════════════════════════════════════════ */

function goveeOverview_() {
  const devices = goveeDevices_();
  const props = PropertiesService.getScriptProperties();
  const sensor = goveeSelectDevice_(devices, 'sensor', props);
  const light = goveeSelectDevice_(devices, 'light', props);
  let climate = {}, lamp = {}, sensorError = null, lightError = null;

  if (sensor) {
    try {
      const state = goveeState_(sensor);
      climate.temperature = goveeStateValue_(state, ['sensorTemperature', 'temperature']);
      climate.humidity = goveeStateValue_(state, ['sensorHumidity', 'humidity']);
      climate.co2 = goveeStateValue_(state, ['carbonDioxideConcentration', 'co2']);
      climate.airQuality = goveeStateValue_(state, ['airQuality', 'pm25', 'pm2_5']);
      climate.online = goveeStateValue_(state, ['online']);
      climate.deviceName = sensor.deviceName || 'Govee Life';
    } catch (error) {
      sensorError = error;
    }
  }
  if (light) {
    try {
      const state = sensor && light.device === sensor.device && light.sku === sensor.sku && !sensorError ? goveeState_(sensor) : goveeState_(light);
      const powerValue = goveeStateValue_(state, ['powerSwitch', 'onOff']);
      lamp.power = powerValue === 1 || powerValue === true || /^(on|1|true)$/i.test(String(powerValue));
      lamp.brightness = goveeStateValue_(state, ['brightness']);
      lamp.colorRgb = goveeStateValue_(state, ['colorRgb']);
      lamp.colorTemperature = goveeStateValue_(state, ['colorTemperatureK']);
      lamp.lightName = light.deviceName || 'Govee Light';
      lamp.lightAvailable = true;
      if (climate.online == null) climate.online = goveeStateValue_(state, ['online']);
    } catch (error) {
      lightError = error;
      lamp.lightAvailable = false;
    }
  }
  if (!sensor && !light) throw new Error('No compatible Govee devices were found');
  if (sensorError && lightError) throw sensorError;
  return Object.assign({ok: true, sensorAvailable: Boolean(sensor) && !sensorError, updatedAt: new Date().toISOString()}, climate, lamp);
}

function goveeControl_(parameter) {
  const props = PropertiesService.getScriptProperties();
  const light = goveeSelectDevice_(goveeDevices_(), 'light', props);
  if (!light) throw new Error('No controllable Govee light was found');
  const command = String(parameter.command || '');
  let instance, value;
  if (command === 'power') {
    instance = 'powerSwitch';
    value = /^(on|1|true)$/i.test(String(parameter.value)) ? 1 : 0;
  } else if (command === 'brightness') {
    instance = 'brightness';
    value = Math.max(1, Math.min(100, Number(parameter.value) || 1));
  } else if (command === 'color') {
    instance = 'colorRgb';
    const hex = String(parameter.value || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error('Invalid colour value');
    value = parseInt(hex, 16);
  } else if (command === 'kelvin') {
    instance = 'colorTemperatureK';
    value = Math.max(2000, Math.min(9000, Number(parameter.value) || 4000));
  } else {
    throw new Error('Unknown Govee command');
  }
  const capability = (light.capabilities || []).find(function(item) { return item.instance === instance; });
  if (!capability) throw new Error('The light does not support ' + command);
  goveeFetch_('https://openapi.api.govee.com/router/api/v1/device/control', {
    method: 'post',
    contentType: 'application/json',
    headers: {'Govee-API-Key': goveeApiKey_()},
    payload: JSON.stringify({
      requestId: Utilities.getUuid(),
      payload: {
        sku: light.sku,
        device: light.device,
        capability: {type: capability.type, instance: capability.instance, value: value}
      }
    })
  });
  return {ok: true, command: command, value: value, updatedAt: new Date().toISOString()};
}

function goveeApiKey_() {
  const key = String(PropertiesService.getScriptProperties().getProperty('GOVEE_API_KEY') || '').trim();
  if (!key) throw new Error('GOVEE_API_KEY is not configured in Script Properties');
  return key;
}

function goveeDevices_() {
  const response = goveeFetch_('https://openapi.api.govee.com/router/api/v1/user/devices', {
    method: 'get', headers: {'Govee-API-Key': goveeApiKey_()}
  });
  return Array.isArray(response.data) ? response.data : [];
}

function goveeSelectDevice_(devices, kind, props) {
  const prefix = kind === 'light' ? 'GOVEE_LIGHT_' : 'GOVEE_SENSOR_';
  const configuredDevice = String(props.getProperty(prefix + 'DEVICE') || '').trim().toUpperCase();
  const configuredSku = String(props.getProperty(prefix + 'SKU') || '').trim().toUpperCase();
  const required = kind === 'light' ? ['powerSwitch'] : ['sensorTemperature', 'sensorHumidity'];
  return devices.find(function(device) {
    const instances = (device.capabilities || []).map(function(capability) { return capability.instance; });
    const hasCapabilities = kind === 'light'
      ? required.every(function(instance) { return instances.indexOf(instance) >= 0; })
      : instances.some(function(instance) { return instance === 'sensorTemperature' || instance === 'temperature'; }) &&
        instances.some(function(instance) { return instance === 'sensorHumidity' || instance === 'humidity'; });
    return hasCapabilities && (!configuredDevice || configuredDevice === String(device.device || '').toUpperCase()) &&
      (!configuredSku || configuredSku === String(device.sku || '').toUpperCase());
  }) || null;
}

function goveeState_(device) {
  const response = goveeFetch_('https://openapi.api.govee.com/router/api/v1/device/state', {
    method: 'post',
    contentType: 'application/json',
    headers: {'Govee-API-Key': goveeApiKey_()},
    payload: JSON.stringify({requestId: Utilities.getUuid(), payload: {sku: device.sku, device: device.device}})
  });
  return response.payload && Array.isArray(response.payload.capabilities) ? response.payload.capabilities : [];
}

function goveeStateValue_(capabilities, instances) {
  for (let i = 0; i < instances.length; i++) {
    const capability = capabilities.find(function(item) { return item.instance === instances[i]; });
    if (!capability || !capability.state) continue;
    const value = capability.state.value;
    if (typeof value === 'boolean') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  }
  return null;
}

function goveeFetch_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions: true}, options || {}));
  const status = response.getResponseCode();
  let data;
  try { data = JSON.parse(response.getContentText() || '{}'); }
  catch (error) { throw new Error('Govee returned an invalid response'); }
  const apiCode = Number(data.code || status);
  if (status < 200 || status >= 300 || apiCode < 200 || apiCode >= 300) throw new Error('Govee API error ' + apiCode);
  return data;
}

function snapshot_() {
  const result = [];
  Object.keys(PIURA_DOCS).forEach(function(section) {
    const body = DocumentApp.openById(PIURA_DOCS[section]).getBody();
    let dynamic = 0;
    leafItems_(body).forEach(function(element) {
      const text = String(element.getText ? element.getText() : '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const detected = dynamicNumber_(text, element);
      if (detected) { dynamic = detected; return; }
      if (!dynamic || isStructuralLabel_(text)) return;
      result.push({section: section, dyn: dynamic, text: text, done: isGreen_(element)});
    });
  });
  return result;
}

function leafItems_(root) {
  const result = [];
  function visit(node) {
    const type = node.getType ? node.getType() : null;
    if (type === DocumentApp.ElementType.PARAGRAPH || type === DocumentApp.ElementType.LIST_ITEM) {
      result.push(node);
      return;
    }
    if (!node.getNumChildren) return;
    for (let i = 0; i < node.getNumChildren(); i++) visit(node.getChild(i));
  }
  visit(root);
  return result;
}

function dynamicNumber_(text, element) {
  const normalized = text.toLocaleLowerCase('ru').replace(/ё/g, 'е');
  let match = normalized.match(/(?:динамик\w*\s*№?\s*([1-8])|^\s*([1-8])\s*[-—.:)]?\s*динамик)/i);
  if (match) return Number(match[1] || match[2]);
  const words = ['первая','вторая','третья','четвертая','пятая','шестая','седьмая','восьмая'];
  for (let i = 0; i < words.length; i++) if (normalized.indexOf(words[i] + ' динамик') >= 0) return i + 1;
  const heading = element.getHeading && element.getHeading() !== DocumentApp.ParagraphHeading.NORMAL;
  if (heading) {
    match = normalized.match(/^\s*([1-8])\s*[-—.:)]/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function isStructuralLabel_(text) {
  const n = normalize_(text);
  return /^(цели|планы|программы|программа|динамики|содержание|идеальная картина|цкп)$/.test(n) ||
    /^(цели|планы|программы)\s+2026/.test(n);
}

function findItem_(body, text) {
  const needle = normalize_(text);
  if (!needle) return null;
  const items = leafItems_(body);
  for (let i = 0; i < items.length; i++) if (normalize_(items[i].getText()) === needle) return items[i];
  return null;
}

function appendToDynamic_(body, dynamic, text) {
  const children = body.getNumChildren();
  let insertAt = children;
  for (let i = 0; i < children; i++) {
    const child = body.getChild(i);
    if (!child.getText) continue;
    const current = dynamicNumber_(child.getText(), child);
    if (current === dynamic) insertAt = i + 1;
    else if (insertAt < children && current) break;
  }
  body.insertParagraph(insertAt, text);
}

function setDone_(element, done) {
  const text = element.editAsText();
  if (!text.getText().length) return;
  text.setBackgroundColor(0, text.getText().length - 1, done ? '#b7e1cd' : null);
  text.setForegroundColor(0, text.getText().length - 1, done ? '#1a6b4a' : null);
}

function isGreen_(element) {
  const text = element.editAsText();
  const value = text.getText();
  const greens = {'#b7e1cd':1,'#d9ead3':1,'#93c47d':1,'#6aa84f':1,'#34a853':1,'#00b050':1,'#00ff00':1,'#1a6b4a':1};
  for (let i = 0; i < value.length; i++) {
    const bg = String(text.getBackgroundColor(i) || '').toLowerCase();
    const fg = String(text.getForegroundColor(i) || '').toLowerCase();
    if (greens[bg] || greens[fg]) return true;
  }
  return false;
}

function normalize_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru');
}

function authorize_(provided) {
  const required = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN') || '';
  if (required) {
    if (provided === required) return;
    throw new Error('Access denied');
  }
  if (!provided) throw new Error('Firebase sign-in required');
  const response = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyBNTLYV4bgG0V-SG6X-A5bsLA_CV7G-ElA',
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({idToken: String(provided)}),
      muteHttpExceptions: true
    }
  );
  if (response.getResponseCode() !== 200) throw new Error('Firebase token rejected');
  const user = (JSON.parse(response.getContentText()).users || [])[0] || {};
  if (String(user.email || '').toLowerCase() !== 'kol9932@gmail.com' || user.emailVerified !== true) {
    throw new Error('Access denied');
  }
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
