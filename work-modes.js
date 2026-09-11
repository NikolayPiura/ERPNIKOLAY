(function(){
  'use strict';
  const modeLabels={morning:'Утро',work:'Работа',learning:'Обучение',mentorship:'Наставничество'};
  const days=[
    {day:1,short:'ПН',name:'Понедельник',focus:'Климат',mode:'work',icon:'climate'},
    {day:2,short:'ВТ',name:'Вторник',focus:'Инвестиции',mode:'work',icon:'investments'},
    {day:3,short:'СР',name:'Среда',focus:'Климат',mode:'work',icon:'climate'},
    {day:4,short:'ЧТ',name:'Четверг',focus:'Админ',mode:'work',icon:'admin'},
    {day:5,short:'ПТ',name:'Пятница',focus:'Фонды',mode:'work',icon:'funds'},
    {day:6,short:'СБ',name:'Суббота',focus:'Наставничество',mode:'mentorship',icon:'mentorship'},
    {day:0,short:'ВС',name:'Воскресенье',focus:'Наставничество',mode:'mentorship',icon:'mentorship'}
  ];
  const icons={
    climate:'<path d="M20 42a13 13 0 1 1 20-11 10 10 0 1 1 2 20H20a9 9 0 0 1 0-18"/><path d="M19 52h26"/>',
    investments:'<path d="M12 49V31m13 18V20m14 29V28m13 21V12"/><path d="m11 23 13-8 13 5 16-13"/>',
    admin:'<rect x="13" y="10" width="38" height="44" rx="8"/><path d="M23 22h18M23 32h18M23 42h12"/><path d="m39 41 4 4 8-10"/>',
    funds:'<ellipse cx="32" cy="18" rx="19" ry="9"/><path d="M13 18v12c0 5 9 9 19 9s19-4 19-9V18M13 30v12c0 5 9 9 19 9s19-4 19-9V30"/>',
    mentorship:'<circle cx="23" cy="25" r="8"/><circle cx="43" cy="25" r="8"/><path d="M10 51c1-10 6-15 13-15s12 5 13 15M30 51c1-10 6-15 13-15s12 5 13 15"/><path d="M23 9h25l7 7-7 7"/>'
  };
  let active=null,timer=null,noticeTimer=null;
  function finish(text,state=''){
    clearTimeout(timer);clearTimeout(noticeTimer);
    const status=document.querySelector('.work-modes-status');
    if(status){
      status.textContent=state==='ok'?'':text;
      status.dataset.state=state;
      if(text&&state!=='busy'&&state!=='ok')noticeTimer=setTimeout(()=>{status.textContent='';status.dataset.state=''},15000);
    }
    document.querySelectorAll('.work-mode,.mode-shortcut').forEach(button=>button.removeAttribute('aria-busy'));
  }
  function titleFor(button){
    return button.dataset.dayName ? button.dataset.dayName+' · '+button.dataset.focus : (modeLabels[button.dataset.mode]||button.dataset.mode);
  }
  function icon(name){return '<svg viewBox="0 0 64 64" aria-hidden="true">'+icons[name]+'</svg>'}
  function link(day,today){
    const current=day.day===today?' is-today':'';
    const weekend=day.mode==='mentorship'?' weekend':'';
    return '<a class="work-mode'+current+weekend+'" href="piura-modes://'+day.mode+'" data-mode="'+day.mode+'" data-day="'+day.day+'" data-day-name="'+day.name+'" data-focus="'+day.focus+'" aria-label="'+day.name+': '+day.focus+'"'+(day.day===today?' aria-current="date"':'')+'><span class="work-mode-day">'+day.short+'</span><span class="work-mode-art">'+icon(day.icon)+'</span><strong>'+day.focus+'</strong></a>';
  }
  function activate(button,event){
    const mode=button.dataset.mode;
    if(!Object.hasOwn(modeLabels,mode))return;
    try{(window.parent!==window?window.parent:window).piuraSetMusicMode?.(mode)}catch(_){ }
    const label=titleFor(button);
    active={mode,day:button.dataset.day||'',focus:button.dataset.focus||'',requestID:(window.crypto?.randomUUID?.()||String(Date.now()))};
    finish('Передаю «'+label+'» приложению…','busy');
    button.setAttribute('aria-busy','true');
    const bridge=window.webkit?.messageHandlers?.piura;
    if(bridge){event.preventDefault();bridge.postMessage({...active,preview:false})}
    else button.href='piura-modes://'+mode+'?request='+encodeURIComponent(active.requestID)+'&day='+encodeURIComponent(active.day)+'&focus='+encodeURIComponent(active.focus);
    timer=setTimeout(()=>finish('Запрос отправлен. Если режим не сменился, нажмите ещё раз или откройте PIURA Modes.'),12000);
  }
  function draw(root){
    const today=new Date().getDay();
    root.classList.add('work-modes');
    root.innerHTML='<div class="work-mode-shortcuts"><a class="mode-shortcut morning-shortcut" href="piura-modes://morning" data-mode="morning" aria-label="Включить режим Утро"><span>Утро</span></a><a class="mode-shortcut learning-shortcut" href="piura-modes://learning" data-mode="learning" aria-label="Включить режим Обучение"><span>Обучение</span></a></div><div class="work-modes-grid">'+days.map(day=>link(day,today)).join('')+'</div><p class="work-modes-status" role="status" aria-live="polite"></p>';
    root.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',event=>activate(button,event)));
  }
  window.piuraModeFinished=result=>{if(result.requestID&&active&&result.requestID!==active.requestID)return;finish(result.message||'Готово',result.ok===false?'error':'ok')};
  window.piuraModeStarted=mode=>finish('Выполняю «'+(modeLabels[mode]||mode)+'»…','busy');
  window.piuraModeNeedsAccess=()=>finish('PIURA Modes нужен доступ к управлению окнами macOS.','error');
  window.addEventListener('message',event=>{if(event.origin!==location.origin)return;if(event.data?.type==='piura-mode-result')window.piuraModeFinished(event.data)});
  window.addEventListener('pageshow',()=>{if(active)finish('')});
  window.addEventListener('focus',()=>{document.querySelectorAll('.work-mode,.mode-shortcut').forEach(button=>button.removeAttribute('aria-busy'))});
  document.querySelectorAll('[data-work-modes]').forEach(draw);
})();
