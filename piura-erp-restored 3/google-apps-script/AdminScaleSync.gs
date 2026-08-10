/**
 * PIURA ERP · Google Docs ↔ Admin Scale
 * Deploy as a Google Apps Script Web App (execute as yourself).
 * Optional: add Script Property SYNC_TOKEN and enter the same value in ERP settings.
 */
const PIURA_DOCS = {
  'цели': '14LSlYVFN0NZFMw0a-50jEexXjvPf--1KvBVprMK058c',
  'планы': '1J5wux0DZxyQkYwOKkUkBQjgAcPoMp4Fcyq1HC5wOUfM',
  'проги': '1d9I_5iUwRWL5O3o-RmcFjYxUQviq0gjhWdTqNelTUEM',
  'боевой': '1Gpq4IF8LeyELNCAosFOMYaMwYlypTgeoPi-ju49g8ys'
};

function doGet(e) {
  try {
    authorize_(e.parameter.token);
    const action = e.parameter.action || 'snapshot';
    if (action === 'snapshot') return json_({ok: true, items: snapshot_(), at: new Date().toISOString()});
    if (action === 'backupLoad') return json_({ok: true, backup: loadBackup_(), at: new Date().toISOString()});
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
    if (p.action === 'backupSave') {
      const saved = saveBackup_(p.data || '{}');
      return json_({ok: true, at: saved.updatedAt});
    }
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

function loadBackup_() {
  const file = backupFile_();
  if (!file) return null;
  try { return JSON.parse(file.getBlob().getDataAsString('UTF-8')); }
  catch (error) { throw new Error('ERP backup is damaged: ' + error.message); }
}

function saveBackup_(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid ERP backup');
  }
  const saved = {version: 1, updatedAt: new Date().toISOString(), data: parsed.data};
  const json = JSON.stringify(saved);
  if (json.length > 5000000) throw new Error('ERP backup is larger than 5 MB');
  let file = backupFile_();
  if (file) file.setContent(json);
  else {
    file = DriveApp.createFile('PIURA_ERP_BACKUP.json', json, MimeType.PLAIN_TEXT);
    PropertiesService.getScriptProperties().setProperty('ERP_BACKUP_FILE_ID', file.getId());
  }
  const day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ERP_BACKUP_ARCHIVE_DAY') !== day) {
    DriveApp.createFile('PIURA_ERP_BACKUP_' + day + '.json', json, MimeType.PLAIN_TEXT);
    props.setProperty('ERP_BACKUP_ARCHIVE_DAY', day);
  }
  return saved;
}

function backupFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ERP_BACKUP_FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (error) {}
  }
  const files = DriveApp.getFilesByName('PIURA_ERP_BACKUP.json');
  if (!files.hasNext()) return null;
  const file = files.next();props.setProperty('ERP_BACKUP_FILE_ID', file.getId());return file;
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
  if (required && provided !== required) throw new Error('Access denied');
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
