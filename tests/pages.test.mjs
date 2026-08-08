import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key)
};

const pages = await Promise.all([
  import('../src/pages/overview.js'),
  import('../src/pages/performance.js'),
  import('../src/pages/planning.js'),
  import('../src/pages/capital.js'),
  import('../src/pages/income.js'),
  import('../src/pages/settings.js')
]);

test('all application pages render from an empty browser profile', () => {
  const renderers = [
    pages[0].renderOverview,
    pages[1].renderPerformance,
    pages[2].renderPlanning,
    pages[3].renderCapital,
    pages[4].renderIncome,
    pages[5].renderSettings
  ];
  for (const render of renderers) {
    const html = render();
    assert.ok(html.length > 500);
    assert.match(html, /<h1>/);
    assert.doesNotMatch(html, /<iframe\b/i);
  }
});
