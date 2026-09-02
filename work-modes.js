(function(){
  'use strict';
  const labels={morning:'Утро',climate:'Климат',investments:'Инвестиции',learning:'Обучение',mentorship:'Наставничество'};
  const art={
    morning:'<ellipse cx="110" cy="176" rx="76" ry="12" fill="currentColor" opacity=".09"/><path d="M30 129l80-44 80 44-80 44Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".5"/><path d="M30 129v13l80 44v-13M190 129v13l-80 44" fill="none" stroke="currentColor" opacity=".35"/><path d="M62 127a48 48 0 0 1 96 0" fill="url(#G)" stroke="#dcfff5" stroke-opacity=".7"/><path d="M54 133h112M70 145h80M89 157h42" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><g stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M110 47v14M54 69l10 10M166 69l-10 10M33 109h15M172 109h15"/></g>',
    climate:'<ellipse cx="110" cy="178" rx="79" ry="12" fill="currentColor" opacity=".1"/><path d="M34 83l84-42 70 36-83 43Z" fill="url(#G)" stroke="#dbfff8" stroke-opacity=".7"/><path d="M34 83v66l71 37v-66Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".6"/><path d="M105 120l83-43v65l-83 44Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".6"/><path d="M50 87l53 27M50 102l53 27M50 117l28 14M119 122l52-27M119 137l52-27" stroke="currentColor" stroke-width="3" opacity=".55"/><path d="M86 53V32l31-16 30 15v22l-30 17Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".7"/><path d="M86 32l31-16 30 15-30 17Z" fill="url(#G)" stroke="#ddfff6" stroke-opacity=".65"/><path d="M117 48v22" stroke="currentColor" opacity=".65"/><circle cx="153" cy="142" r="26" fill="#102c2b" stroke="currentColor" stroke-width="2"/><circle cx="153" cy="142" r="17" fill="none" stroke="url(#G)" stroke-width="9" stroke-dasharray="9 5"/><circle cx="153" cy="142" r="7" fill="url(#G)"/>',
    investments:'<circle class="orbit" cx="110" cy="100" r="79" fill="none" stroke="currentColor" stroke-dasharray="2 10" opacity=".35"/><g stroke="currentColor" stroke-opacity=".55"><path d="M45 116l29-16 28 16-29 17Z" fill="url(#G)"/><path d="M45 116v42l28 16v-41Z" fill="url(#D)"/><path d="M73 133l29-17v41l-29 17Z" fill="url(#D)"/><path d="M94 81l30-17 28 17-29 18Z" fill="url(#G)"/><path d="M94 81v65l29 17V99Z" fill="url(#D)"/><path d="M123 99l29-18v66l-29 16Z" fill="url(#D)"/><path d="M146 45l27-16 27 16-27 16Z" fill="url(#G)"/><path d="M146 45v90l27 17V61Z" fill="url(#D)"/><path d="M173 61l27-16v90l-27 17Z" fill="url(#D)"/></g><path d="M34 94l43-33 33 3 28-35M124 31l14-2-2 14" fill="none" stroke="currentColor" stroke-width="3"/>',
    learning:'<ellipse cx="110" cy="179" rx="80" ry="11" fill="currentColor" opacity=".08"/><path d="M34 103l67 24 82-28v54l-82 31-67-27Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".55"/><path d="M40 97q34-6 63 17 32-26 73-21v58q-41-2-73 26-27-25-63-26Z" fill="url(#G)" stroke="#d1fff2" stroke-opacity=".55"/><path d="M103 115v56M52 116l38 15M52 131l38 15M116 130l47-19M116 146l47-20" stroke="#134c43" stroke-width="2" opacity=".65"/><path d="M32 58l79-38 78 36-78 39Z" fill="url(#G)" stroke="currentColor"/><path d="M68 77v20q43 25 82-2V77l-39 18Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".7"/><path d="M189 56v45" stroke="currentColor" stroke-width="3"/><path d="M189 99l-7 16h14Z" fill="url(#G)"/>',
    mentorship:'<ellipse cx="110" cy="180" rx="78" ry="10" fill="currentColor" opacity=".08"/><path d="M29 148l37-22 42 23-38 24Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".35"/><path d="M115 150l38-22 40 23-38 24Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".35"/><circle cx="69" cy="90" r="23" fill="url(#G)" stroke="#d6fff3" stroke-opacity=".65"/><path d="M36 150v-18q0-28 33-28t33 28v18l-33 18Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".8"/><circle cx="153" cy="99" r="20" fill="url(#G)" stroke="#d6fff3" stroke-opacity=".65"/><path d="M123 157v-24q0-21 30-21t30 21v24l-30 16Z" fill="url(#D)" stroke="currentColor" stroke-opacity=".8"/><path d="M89 33q0-8 8-8h69q8 0 8 8v29q0 8-8 8h-40l-18 17V70H97q-8 0-8-8Z" fill="url(#G)" stroke="currentColor"/><path d="M107 43h49M107 55h33" stroke="#164c40" stroke-width="3" stroke-linecap="round"/>'
  };
  let active=null,timer=null,noticeTimer=null;
  function finish(text,state=''){
    clearTimeout(timer);clearTimeout(noticeTimer);
    const s=document.querySelector('.work-modes-status');
    if(s){s.textContent=state==='ok'?'':text;s.dataset.state=state;
      if(text&&state!=='busy'&&state!=='ok')noticeTimer=setTimeout(()=>{s.textContent='';s.dataset.state=''},15000);
    }
    document.querySelectorAll('.work-mode').forEach(b=>b.removeAttribute('aria-busy'));
  }
  function draw(root){
    root.classList.add('work-modes');
    root.innerHTML='<div class="work-modes-grid">'+Object.entries(labels).map(([mode,label])=>{
      const g='mode-'+mode+'-light',d='mode-'+mode+'-dark',svg=art[mode].replaceAll('#G','#'+g).replaceAll('#D','#'+d);
      return '<a class="work-mode" href="piura-modes://'+mode+'" data-mode="'+mode+'" aria-label="'+label+'"><svg viewBox="0 0 220 205" aria-hidden="true" style="color:var(--tone)"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3fffa"/><stop offset=".42" stop-color="var(--tone)"/><stop offset="1" stop-color="var(--tone)" stop-opacity=".28"/></linearGradient><linearGradient id="'+d+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="var(--tone)" stop-opacity=".38"/><stop offset="1" stop-color="#091523"/></linearGradient></defs>'+svg+'</svg></a>';
    }).join('')+'</div><p class="work-modes-status" role="status" aria-live="polite"></p>';
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
  window.addEventListener('pageshow',()=>{if(active)finish('')});
  window.addEventListener('focus',()=>{document.querySelectorAll('.work-mode').forEach(b=>b.removeAttribute('aria-busy'))});
  document.querySelectorAll('[data-work-modes]').forEach(draw);
})();
