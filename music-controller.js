(function(){
  'use strict';
  const card=document.getElementById('musicCard');
  if(!card)return;
  const artist=document.getElementById('musicArtist');
  const play=document.getElementById('musicPlay');
  const status=document.getElementById('musicStatus');
  let requestID='',timer=0;
  function setBusy(value){
    card.classList.toggle('is-busy',value);
    card.querySelectorAll('[data-music-action]').forEach(button=>button.disabled=value);
  }
  function finish(result={}){
    if(result.requestID&&requestID&&result.requestID!==requestID)return;
    clearTimeout(timer);setBusy(false);
    if(result.ok===false){
      status.textContent=result.message||'Не удалось связаться с музыкой';
      artist.textContent=result.message||'Нет связи с плеером';
      card.classList.add('has-error');
      return;
    }
    card.classList.remove('has-error');
    if(result.artist&&result.artist!=='Исполнитель')artist.textContent=result.artist;
    const playing=result.state==='playing';
    card.classList.toggle('is-playing',playing);
    play.setAttribute('aria-label',playing?'Поставить музыку на паузу':'Включить музыку');
    play.innerHTML=playing?'<span aria-hidden="true">Ⅱ</span>':'<span aria-hidden="true">▶</span>';
    status.textContent=playing?'Музыка играет':'Музыка на паузе';
  }
  function send(action){
    requestID=window.crypto?.randomUUID?.()||String(Date.now());
    setBusy(true);status.textContent='Передаю команду…';
    const bridge=window.webkit?.messageHandlers?.piura;
    if(bridge)bridge.postMessage({action:'music',command:action,requestID});
    else{
      const params=new URLSearchParams({action,request:requestID});
      location.href='piura-modes://music?'+params;
    }
    timer=setTimeout(()=>{setBusy(false);status.textContent='Команда отправлена'},9000);
  }
  card.querySelectorAll('[data-music-action]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.musicAction)));
  window.piuraMusicResult=finish;
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='piura-music-result')finish(event.data)});
})();
