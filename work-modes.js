(function(){
  'use strict';
  const labels={morning:'Утро',climate:'Климат',investments:'Инвестиции',learning:'Обучение',mentorship:'Наставничество'};
  const art={
    morning:'<g class="orbit" fill="none" stroke="currentColor" opacity=".38"><circle cx="110" cy="100" r="76" stroke-dasharray="2 9"/><circle cx="110" cy="100" r="61"/></g><circle cx="110" cy="98" r="40" fill="url(#G)" stroke="#fff5"/><path d="M48 115Q110 140 172 115M40 129Q110 156 180 129M59 144Q110 165 161 144" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"/><path d="M110 25v10M57 46l8 8M163 46l-8 8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="110" cy="179" rx="54" ry="6" fill="currentColor" opacity=".08"/>',
    climate:'<circle class="orbit" cx="110" cy="100" r="79" fill="none" stroke="currentColor" stroke-dasharray="1 9" opacity=".28"/><path d="M27 54L174 41 199 54 51 69Z" fill="url(#G)" stroke="#fff4"/><path d="M27 54L51 69v56L27 109Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".35"/><path d="M51 69L199 54v56L51 125Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".55"/><path d="M61 99L189 86v15L61 115Z" fill="#081623" stroke="currentColor" stroke-opacity=".4"/><path d="M64 105l121-12M64 110l121-12" stroke="currentColor" opacity=".5"/><path d="M62 77l85-8" stroke="#fff5"/><rect x="174" y="66" width="13" height="5" rx="2" fill="currentColor"/><g class="flow" fill="none" stroke="currentColor" stroke-width="2" opacity=".7"><path d="M83 126q-9 18 0 40"/><path d="M120 122q-9 24 0 49"/><path d="M157 118q-9 20 0 42"/></g>',
    investments:'<circle class="orbit" cx="110" cy="100" r="79" fill="none" stroke="currentColor" stroke-dasharray="2 10" opacity=".35"/><g stroke="currentColor" stroke-opacity=".55"><path d="M45 116l29-16 28 16-29 17Z" fill="url(#G)"/><path d="M45 116v42l28 16v-41Z" fill="url(#D)"/><path d="M73 133l29-17v41l-29 17Z" fill="url(#D)"/><path d="M94 81l30-17 28 17-29 18Z" fill="url(#G)"/><path d="M94 81v65l29 17V99Z" fill="url(#D)"/><path d="M123 99l29-18v66l-29 16Z" fill="url(#D)"/><path d="M146 45l27-16 27 16-27 16Z" fill="url(#G)"/><path d="M146 45v90l27 17V61Z" fill="url(#D)"/><path d="M173 61l27-16v90l-27 17Z" fill="url(#D)"/></g><path d="M34 94l43-33 33 3 28-35M124 31l14-2-2 14" fill="none" stroke="currentColor" stroke-width="3"/>',
    learning:'<circle class="orbit" cx="110" cy="100" r="79" fill="none" stroke="currentColor" stroke-dasharray="2 9" opacity=".35"/><path d="M30 70Q66 48 110 76q44-28 80-6v85q-39-19-80 5-41-24-80-5Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".65"/><path d="M39 58q35-12 71 16 36-28 71-16v84q-35-10-71 17-36-27-71-17Z" fill="url(#G)" stroke="#fff5"/><path d="M110 76v77M52 83q21 0 44 17M52 100q21 0 44 17M52 117q21 0 44 17M124 100q23-17 44-17M124 117q23-17 44-17M124 134q23-17 44-17" fill="none" stroke="#192945" stroke-opacity=".65" stroke-width="2"/><path d="M88 41l22-15 22 15-22 15Z" fill="currentColor" opacity=".6"/>',
    mentorship:'<circle class="orbit" cx="110" cy="100" r="79" fill="none" stroke="currentColor" stroke-dasharray="2 9" opacity=".35"/><path d="M27 54q0-13 13-13h94q13 0 13 13v54q0 13-13 13H76l-30 23v-23h-6q-13 0-13-13Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".7"/><path d="M80 95q0-12 12-12h95q12 0 12 12v52q0 12-12 12h-8v23l-29-23H92q-12 0-12-12Z" fill="url(#G)" stroke="#fff5"/><path d="M48 64h65M48 79h48" stroke="currentColor" opacity=".65" stroke-width="3" stroke-linecap="round"/><g fill="#172333"><circle cx="110" cy="123" r="5"/><circle cx="139" cy="123" r="5"/><circle cx="168" cy="123" r="5"/></g>'
  };
  let active=null,timer=null;
  function finish(text,state=''){const s=document.querySelector('.work-modes-status');if(s){s.textContent=text;s.dataset.state=state}document.querySelectorAll('.work-mode').forEach(b=>b.removeAttribute('aria-busy'));clearTimeout(timer)}
  function draw(root){
    root.classList.add('work-modes');
    root.innerHTML='<div class="work-modes-grid">'+Object.entries(labels).map(([mode,label])=>{
      const g='mode-'+mode+'-light',d='mode-'+mode+'-dark',svg=art[mode].replaceAll('#G','#'+g).replaceAll('#D','#'+d);
      return '<a class="work-mode" href="piura-modes://'+mode+'" data-mode="'+mode+'" aria-label="'+label+'"><svg viewBox="0 0 220 205" aria-hidden="true" style="color:var(--tone)"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3fffa"/><stop offset=".42" stop-color="var(--tone)"/><stop offset="1" stop-color="var(--tone)" stop-opacity=".28"/></linearGradient><linearGradient id="'+d+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--tone)" stop-opacity=".38"/><stop offset="1" stop-color="#091523"/></linearGradient></defs>'+svg+'</svg><strong>'+label+'</strong></a>';
    }).join('')+'</div><p class="work-modes-status" role="status" aria-live="polite">Три экрана · пять режимов</p>';
    root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',event=>{
      const mode=button.dataset.mode;if(!Object.hasOwn(labels,mode))return;
      active={mode,requestID:(window.crypto?.randomUUID?.()||String(Date.now()))};
      finish('Передаю «'+labels[mode]+'» приложению…','busy');button.setAttribute('aria-busy','true');
      const bridge=window.webkit?.messageHandlers?.piura;
      if(bridge){event.preventDefault();bridge.postMessage({...active,preview:false})}
      else button.href='piura-modes://'+mode+'?request='+encodeURIComponent(active.requestID);
      // Never disable links: cancellation, tab suspension and missing app callbacks
      // must not prevent a fresh request. Native runner serializes them.
      timer=setTimeout(()=>finish('Запрос отправлен. Если режим не сменился, нажмите ещё раз или откройте PIURA Modes.'),12000);
    }));
  }
  window.piuraModeFinished=result=>{if(result.requestID&&active&&result.requestID!==active.requestID)return;finish(result.message||'Готово',result.ok===false?'error':'ok')};
  window.piuraModeStarted=mode=>finish('Выполняю «'+(labels[mode]||mode)+'»…','busy');
  window.piuraModeNeedsAccess=()=>finish('PIURA Modes нужен доступ к управлению окнами macOS.','error');
  window.addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='piura-mode-result')window.piuraModeFinished(event.data)});
  window.addEventListener('pageshow',()=>{if(active)finish('Можно выбрать следующий режим.')});
  window.addEventListener('focus',()=>{document.querySelectorAll('.work-mode').forEach(b=>b.removeAttribute('aria-busy'))});
  document.querySelectorAll('[data-work-modes]').forEach(draw);
})();
