(function(){
  'use strict';
  const card=document.getElementById('musicCard');
  if(!card)return;
  const artist=document.getElementById('musicArtist');
  const play=document.getElementById('musicPlay');
  const status=document.getElementById('musicStatus');
  function finish(result={}){
    const track=result.currentTrack||result.payload?.currentTrack;
    const artistName=track?.subtitle||track?.artists?.map(item=>item?.name||item).filter(Boolean).join(', ')||track?.artist;
    const trackName=track?.title||track?.name;
    if(trackName||artistName)artist.textContent=[trackName,artistName].filter(Boolean).join(' — ');
    const currentStatus=String(result.status||result.payload?.status||'IDLE').toUpperCase();
    const playing=currentStatus==='PLAYING';
    card.classList.toggle('is-playing',playing);
    play.setAttribute('aria-label',playing?'Поставить музыку на паузу':'Включить музыку');
    play.innerHTML=playing?'<span aria-hidden="true">Ⅱ</span>':'<span aria-hidden="true">▶</span>';
    status.textContent=playing?'Музыка играет':'Музыка на паузе';
  }
  function send(action){
    const host=window.parent!==window?window.parent:window;
    host.piuraMusicCommand?.(action);
  }
  card.querySelectorAll('[data-music-action]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.musicAction)));
  window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='piura-music-state')finish(event.data)});
  try{finish(window.parent.piuraMusicSnapshot?.()||{})}catch(_){ }
})();
