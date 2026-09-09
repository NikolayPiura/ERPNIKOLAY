(function(){
  'use strict';
  const card=document.getElementById('musicCard');
  if(!card)return;
  const artist=document.getElementById('musicArtist');
  const play=document.getElementById('musicPlay');
  const status=document.getElementById('musicStatus');
  const volume=document.getElementById('musicVolume');
  const volumeValue=document.getElementById('musicVolumeValue');
  let requestID='',timer=0;
  function setBusy(value){
    card.classList.toggle('is-busy',value);
    card.querySelectorAll('[data-music-action]').forEach(button=>button.disabled=value);
  }
  function paintVolume(value){
    const next=Math.max(0,Math.min(100,Number(value)||0));
    volume.value=String(next);
    volumeValue.value=next+'%';
    volumeValue.textContent=next+'%';
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
    if(result.volume!==undefined&&document.activeElement!==volume)paintVolume(result.volume);
    const playing=result.state==='playing';
    card.classList.toggle('is-playing',playing);
    play.setAttribute('aria-label',playing?'Поставить музыку на паузу':'Включить музыку');
    play.innerHTML=playing?'<span aria-hidden="true">Ⅱ</span>':'<span aria-hidden="true">▶</span>';
    status.textContent=playing?'Музыка играет':'Музыка на паузе';
  }
  function send(action,value){
    requestID=window.crypto?.randomUUID?.()||String(Date.now());
    setBusy(true);status.textContent='Передаю команду…';
    const bridge=window.webkit?.messageHandlers?.piura;
    if(bridge)bridge.postMessage({action:'music',command:action,value,requestID});
    else{
      const params=new URLSearchParams({action,request:requestID});
      if(value!==undefined)params.set('value',String(value));
      location.href='piura-modes://music?'+params;
    }
    timer=setTimeout(()=>{setBusy(false);status.textContent='Команда отправлена'},9000);
  }
  card.querySelectorAll('[data-music-action]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.musicAction)));
  volume.addEventListener('input',()=>paintVolume(volume.value));
  volume.addEventListener('change',()=>send('volume',Math.round(Number(volume.value))));
  window.piuraMusicResult=finish;
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='piura-music-result')finish(event.data)});
})();
