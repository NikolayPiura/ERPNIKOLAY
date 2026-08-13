(function(){
  'use strict';
  const SHEET_ID='1GWFyFKRVq1Z4x68gWICBmlilqP5FzYOXXBkC4xYzEbA';
  const ALLOWED=new Set(['2026 (НЕД)','2026 (ФП)','2026 (РАСХОД)','2026 (МЕНТОР)','2026 (СРЕД)','2026 (ПЛАН)','2026 (ФП №1)']);
  const CACHE_PREFIX='piura_personal_income_sheet_v1:';
  let sequence=0;

  function cacheKey(name){return CACHE_PREFIX+name}
  function readCache(name){
    try{return JSON.parse(localStorage.getItem(cacheKey(name))||'null')}catch{return null}
  }
  function writeCache(name,value){
    try{localStorage.setItem(cacheKey(name),JSON.stringify(value))}catch{}
  }
  function load(name,{timeout=20000}={}){
    if(!ALLOWED.has(name))return Promise.reject(new Error('Лист не подключён к ERP'));
    return new Promise((resolve,reject)=>{
      const callback='piuraSheetResponse_'+Date.now()+'_'+(++sequence);
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Таблица не ответила вовремя')),timeout);
      function finish(error,payload){
        clearTimeout(timer);script.remove();
        try{delete window[callback]}catch{window[callback]=undefined}
        if(error)reject(error);else resolve(payload);
      }
      window[callback]=response=>{
        if(!response||response.status!=='ok'||!response.table){finish(new Error('Google Sheets вернул ошибку'));return}
        const payload={name,updatedAt:new Date().toISOString(),table:response.table};
        writeCache(name,payload);finish(null,{...payload,cached:false});
      };
      const tqx='out:json;responseHandler:'+callback;
      script.async=true;
      script.onerror=()=>finish(new Error('Не удалось загрузить Google Sheets'));
      script.src='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/gviz/tq?tqx='+encodeURIComponent(tqx)+'&headers=0&sheet='+encodeURIComponent(name)+'&_='+Date.now();
      document.head.appendChild(script);
    }).catch(error=>{
      const cached=readCache(name);
      if(cached)return {...cached,cached:true,error:error.message};
      throw error;
    });
  }
  function cells(payload){
    const cols=payload?.table?.cols?.length||0;
    return (payload?.table?.rows||[]).map(row=>Array.from({length:cols},(_,index)=>row.c?.[index]||null));
  }
  function text(cell){
    if(!cell||cell.v===null||cell.v===undefined)return '';
    if(cell.f!==undefined&&cell.f!==null)return String(cell.f).trim();
    return String(cell.v).trim();
  }
  function number(cell){
    if(typeof cell?.v==='number'&&Number.isFinite(cell.v))return cell.v;
    const value=text(cell).replace(/\s/g,'').replace(/[$₽%]/g,'').replace(',','.').replace(/[^\d.-]/g,'');
    const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;
  }
  function monthOf(cell){
    const value=text(cell);
    const match=value.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-]\d{2,4})?/);
    if(match)return Number(match[2])-1;
    const raw=String(cell?.v||'');
    const dateMatch=raw.match(/Date\(\d+,(\d+),\d+\)/);
    return dateMatch?Number(dateMatch[1]):-1;
  }
  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function money(value){return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(value)||0)}
  function compactMoney(value){
    const amount=Number(value)||0,abs=Math.abs(amount);
    if(abs>=1e6)return '$'+(amount/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+'M';
    if(abs>=1e3)return '$'+Math.round(amount/1e3).toLocaleString('ru-RU')+'K';
    return money(amount);
  }
  window.PIURASheet={id:SHEET_ID,allowed:[...ALLOWED],load,cells,text,number,monthOf,esc,money,compactMoney};
})();
