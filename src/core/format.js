export const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export function number(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value, currency = 'USD', compact = true) {
  const amount = number(value);
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(amount) >= 1_000_000 ? 'compact' : 'standard'
  }).format(amount);
}

export function percent(value, digits = 0) {
  return `${number(value).toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

export function duration(minutes) {
  const total = Math.max(0, Math.round(number(minutes)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function dateKey(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function sum(values) {
  return values.reduce((total, value) => total + number(value), 0);
}
