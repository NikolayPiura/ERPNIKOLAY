(function(){
  'use strict';

  const BOOKS={
    income:{
      id:'1GWFyFKRVq1Z4x68gWICBmlilqP5FzYOXXBkC4xYzEbA',
      sheets:new Set(['2026 (НЕД)','2026 (ФП)','2026 (РАСХОД)','2026 (МЕНТОР)','2026 (СРЕД)','2026 (ПЛАН)','2026 (ФП №1)'])
    },
    pfp:{
      id:'1EmXh84m_H_4I--AbL2tRxBoONr6uTg1CxlyQpiSrFlA',
      sheets:new Set(['2026 (PFF)','2026 (БАЛАНС)','2026 (РЫНОК) ','2026 (РЫНОК)','2026 (ЗОЛОТО)','2026 (КРИПТА)','2026 (СТАТ)','2026 (ПОДПИСКИ)'])
    }
  };
  const CACHE_PREFIX='piura_finance_sheet_v3:';
  const COLORS=['#63a4ff','#43d9a3','#a779ff','#ff8b64','#f4c65d','#48cbe7','#ec6fae','#8ba1bd'];
  let sequence=0,chartSequence=0;

  function cacheKey(book,name){return `${CACHE_PREFIX}${book}:${name}`}
  function readCache(book,name){
    try{return JSON.parse(localStorage.getItem(cacheKey(book,name))||'null')}catch{return null}
  }
  function writeCache(book,name,value){
    try{localStorage.setItem(cacheKey(book,name),JSON.stringify(value))}catch{}
  }
  function load(name,{timeout=20000,book='income'}={}){
    const source=BOOKS[book];
    if(!source||!source.sheets.has(name))return Promise.reject(new Error('Лист не подключён к ERP'));
    return new Promise((resolve,reject)=>{
      const callback=`piuraSheetResponse_${Date.now()}_${++sequence}`;
      const script=document.createElement('script');
      const timer=setTimeout(()=>finish(new Error('Таблица не ответила вовремя')),timeout);
      function finish(error,payload){
        clearTimeout(timer);script.remove();
        try{delete window[callback]}catch{window[callback]=undefined}
        if(error)reject(error);else resolve(payload);
      }
      window[callback]=response=>{
        if(!response||response.status!=='ok'||!response.table){finish(new Error('Google Sheets вернул ошибку'));return}
        const payload={book,name,updatedAt:new Date().toISOString(),table:response.table};
        writeCache(book,name,payload);finish(null,{...payload,cached:false});
      };
      const tqx=`out:json;responseHandler:${callback}`;
      script.async=true;
      script.onerror=()=>finish(new Error('Не удалось загрузить Google Sheets'));
      script.src=`https://docs.google.com/spreadsheets/d/${source.id}/gviz/tq?tqx=${encodeURIComponent(tqx)}&headers=0&sheet=${encodeURIComponent(name)}&_=${Date.now()}`;
      document.head.appendChild(script);
    }).catch(error=>{
      const cached=readCache(book,name);
      if(cached)return {...cached,cached:true,error:error.message};
      throw error;
    });
  }
  async function loadMany(names,options={}){
    const entries=await Promise.all(names.map(async name=>{
      try{return [name,await load(name,options)]}catch(error){return [name,{error:error.message,name,book:options.book||'income'}]}
    }));
    return Object.fromEntries(entries);
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
    let value=text(cell).replace(/\s/g,'').replace(/[$₽€%]/g,'').replace(/\u00a0/g,'');
    if(value.includes(',')&&!value.includes('.'))value=value.replace(',','.');
    else value=value.replace(/,/g,'');
    value=value.replace(/[^\d.-]/g,'');
    const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;
  }
  function normalize(value){return String(value??'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ')}
  function monthOf(cell){
    const value=text(cell),match=value.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-]\d{2,4})?/);
    if(match)return Number(match[2])-1;
    const raw=String(cell?.v||''),dateMatch=raw.match(/Date\(\d+,(\d+),\d+\)/);
    return dateMatch?Number(dateMatch[1]):-1;
  }
  function headerIndex(rows,...labels){
    const wanted=labels.flat().map(normalize);
    return rows.findIndex(row=>row.some(cell=>wanted.includes(normalize(text(cell)))));
  }
  function rowNamed(rows,name,column=0){return rows.find(row=>normalize(text(row[column]))===normalize(name))}
  function sum(values){return values.reduce((total,value)=>total+(Number(value)||0),0)}
  function esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function money(value,currency='USD',digits=0){
    return new Intl.NumberFormat('ru-RU',{style:'currency',currency,minimumFractionDigits:0,maximumFractionDigits:digits}).format(Number(value)||0);
  }
  function compactMoney(value,currency='$'){
    const amount=Number(value)||0,abs=Math.abs(amount),sign=amount<0?'-':'';
    if(abs>=1e9)return `${sign}${currency}${(abs/1e9).toLocaleString('ru-RU',{maximumFractionDigits:2})}B`;
    if(abs>=1e6)return `${sign}${currency}${(abs/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})}M`;
    if(abs>=1e3)return `${sign}${currency}${Math.round(abs/1e3).toLocaleString('ru-RU')}K`;
    return `${sign}${currency}${abs.toLocaleString('ru-RU',{maximumFractionDigits:2})}`;
  }
  function dateLabel(cell){
    const value=text(cell),match=value.match(/^(\d{1,2})[.\/-](\d{1,2})/);
    return match?`${String(Number(match[1])).padStart(2,'0')}.${String(Number(match[2])).padStart(2,'0')}`:value;
  }
  function smoothPath(points){
    if(points.length<2)return points.length?`M${points[0][0]} ${points[0][1]}`:'';
    let path=`M${points[0][0]} ${points[0][1]}`;
    for(let i=0;i<points.length-1;i++){
      const p0=points[i-1]||points[i],p1=points[i],p2=points[i+1],p3=points[i+2]||p2;
      const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
      const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      path+=` C${c1x} ${c1y},${c2x} ${c2y},${p2[0]} ${p2[1]}`;
    }
    return path;
  }
  function formatMetric(value,format='money'){
    if(format==='percent')return `${(Number(value)||0).toLocaleString('ru-RU',{maximumFractionDigits:1})}%`;
    if(format==='number')return (Number(value)||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
    if(format==='rub')return money(value,'RUB',0);
    return money(value,'USD',0);
  }
  function lineChart({title='',subtitle='',labels=[],series=[],format='money',height=290}){
    const id=`psChart${++chartSequence}`,width=1320,padX=50,padY=34;
    const values=series.flatMap(item=>item.values||[]).map(Number).filter(Number.isFinite);
    const max=Math.max(1,...values),min=Math.min(0,...values),span=Math.max(1,max-min);
    const x=index=>labels.length<2?width/2:padX+index*(width-padX*2)/(labels.length-1);
    const y=value=>height-padY-((Number(value)||0)-min)*(height-padY*2)/span;
    const baseline=y(0);
    const defs=series.map((item,index)=>`<linearGradient id="${id}Fill${index}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${item.color||COLORS[index]}" stop-opacity=".32"/><stop offset="1" stop-color="${item.color||COLORS[index]}" stop-opacity="0"/></linearGradient>`).join('');
    const shapes=series.map((item,index)=>{
      const color=item.color||COLORS[index],points=(item.values||[]).map((value,i)=>[x(i),y(value)]),path=smoothPath(points);
      if(!points.length)return '';
      const area=`${path} L${points.at(-1)[0]} ${baseline} L${points[0][0]} ${baseline} Z`;
      return `<path d="${area}" fill="url(#${id}Fill${index})"/><path class="ps-chart-line" d="${path}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/><g>${points.map((point,i)=>`<circle class="ps-chart-point" cx="${point[0]}" cy="${point[1]}" r="7" fill="#0a0f17" stroke="${color}" stroke-width="4"><title>${esc(labels[i])}: ${esc(formatMetric(item.values[i],format))}</title></circle>`).join('')}</g>`;
    }).join('');
    return `<section class="ps-chart ps-reveal" style="--chart-height:${height}px"><div class="ps-chart-head"><div><h3>${esc(title)}</h3>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><div class="ps-chart-legend">${series.map((item,index)=>`<span style="--legend:${item.color||COLORS[index]}">${esc(item.label)}</span>`).join('')}</div></div><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs>${defs}</defs><line x1="${padX}" y1="${baseline}" x2="${width-padX}" y2="${baseline}" stroke="rgba(160,180,210,.14)"/>${shapes}</svg><div class="ps-axis-labels" style="grid-template-columns:repeat(${Math.max(1,labels.length)},minmax(0,1fr))">${labels.map(label=>`<span>${esc(label)}</span>`).join('')}</div></section>`;
  }
  function segment(name,items,active,{accent='blue',icon=true}={}){
    const glyphs={category:'◫',source:'◎',week:'⌁',month:'▦',fact:'●',plan:'◇',compare:'↕',year:'∞',subscriptions:'◉',bonuses:'✦'};
    return `<div class="ps-segment" data-accent="${accent}">${items.map(([value,label])=>`<button type="button" data-control="${name}" data-value="${value}" class="${active===value?'on':''}" title="${esc(label)}" aria-label="${esc(label)}">${icon?`<i>${glyphs[value]||'•'}</i>`:''}<span>${esc(label)}</span></button>`).join('')}</div>`;
  }
  function monthControl(month,months){
    return `<div class="ps-months"><button type="button" data-month="-1" aria-label="Предыдущий месяц">‹</button><strong>${esc(months[month])} 2026</strong><button type="button" data-month="1" aria-label="Следующий месяц">›</button></div>`;
  }
  function metricCards(items){
    return `<section class="ps-metrics ps-reveal">${items.map((item,index)=>`<article class="ps-metric" style="--accent:${item.color||COLORS[index%COLORS.length]}"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong>${item.note?`<small>${esc(item.note)}</small>`:''}</article>`).join('')}</section>`;
  }
  function errorCard(title,message){return `<div class="ps-error"><div><strong>${esc(title)}</strong><p>${esc(message||'Данные временно недоступны')}</p></div></div>`}

  window.PIURASheet={BOOKS,colors:COLORS,load,loadMany,cells,text,number,normalize,monthOf,headerIndex,rowNamed,sum,esc,money,compactMoney,dateLabel,smoothPath,lineChart,segment,monthControl,metricCards,errorCard,formatMetric};
})();
