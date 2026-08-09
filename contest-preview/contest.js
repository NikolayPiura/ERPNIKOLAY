(function () {
  'use strict';

  const app = document.getElementById('contestApp');
  const boot = document.getElementById('boot');
  const cssUrl = new URL('contest-preview/contest.css?v=20260808b', location.href).href;
  const rootUrl = new URL('index.html', location.href);

  function addContestStyles(doc, scope) {
    if (!doc || !doc.head) return;
    doc.documentElement.dataset.piuraContest = scope;
    doc.body?.classList.add('piura-contest');
    if (!doc.getElementById('piuraContestStyles')) {
      const link = doc.createElement('link');
      link.id = 'piuraContestStyles';
      link.rel = 'stylesheet';
      link.href = cssUrl;
      doc.head.appendChild(link);
    }
  }

  function createCommandBar(doc, moduleFrame) {
    const stage = doc.querySelector('.stage');
    if (!stage || doc.getElementById('contestCommandBar')) return;
    const bar = doc.createElement('div');
    bar.id = 'contestCommandBar';
    bar.className = 'contest-command-bar';
    bar.innerHTML = '<div class="contest-command-brand"><i></i><strong>PIURA LIFE OS</strong><span>COMPETITION CONCEPT</span></div><div class="contest-command-context"><span id="contestServiceName">Главная</span><b>LIVE SYSTEM</b><time>08 · 08 · 2026</time></div>';
    stage.insertBefore(bar, moduleFrame);
  }

  function moduleName(rootDoc, moduleDoc, frame) {
    return rootDoc?.querySelector('.menu-item.active .item-copy strong')?.textContent?.trim()
      || moduleDoc?.querySelector('h1,.logo,.page-title,.hero-name')?.textContent?.trim()
      || frame.title
      || 'PIURA ERP';
  }

  function wireRoot() {
    const doc = app.contentDocument;
    if (!doc) return;
    addContestStyles(doc, 'shell');
    const moduleFrame = doc.getElementById('moduleFrame');
    if (!moduleFrame) return;
    createCommandBar(doc, moduleFrame);

    const applyModule = () => {
      try {
        const moduleDoc = moduleFrame.contentDocument;
        addContestStyles(moduleDoc, 'module');
        const label = doc.getElementById('contestServiceName');
        if (label) label.textContent = moduleName(doc, moduleDoc, moduleFrame);
      } catch (error) {
        console.warn('Contest module styling', error);
      }
    };

    moduleFrame.addEventListener('load', () => {
      setTimeout(applyModule, 30);
      setTimeout(applyModule, 500);
    });
    applyModule();
    setInterval(applyModule, 1600);
    boot.classList.add('hidden');
    setTimeout(() => boot.remove(), 500);
  }

  async function start() {
    const response = await fetch(rootUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Не удалось загрузить основу ERP');
    let html = await response.text();
    const base = rootUrl.href.replace(/index\.html$/, '');
    html = html
      .replace('<head>', '<head><base href="' + base + '"><meta name="piura-preview" content="contest">')
      .replace('<title>PIURA ERP</title>', '<title>PIURA ERP — Contest Concept</title>')
      .replaceAll('piura_erp_shell_v5', 'piura_contest_shell_v1')
      .replaceAll('piura_erp_shell_order_v5', 'piura_contest_order_v1')
      .replaceAll('piura_erp_shell_profiles_v1', 'piura_contest_profiles_v1')
      .replace('</head>', '<link id="piuraContestStyles" rel="stylesheet" href="' + cssUrl + '"><script>document.documentElement.dataset.piuraContest="shell";<\/script></head>');
    app.addEventListener('load', wireRoot, { once: true });
    app.srcdoc = html;
  }

  start().catch(error => {
    boot.querySelector('span').textContent = error.message;
  });
})();
