/* Physical office lighting, using the existing overview color-wheel handler. */
(()=>{
  if(window.piuraOfficeVersion==='10.1')return;
  window.piuraOfficeVersion='10.1';
  const colors={morning:'#39ff00',work:'#a600ff',learning:'#ff8000',mentorship:'#00e5df'};
  let controller,ready,queue=Promise.resolve();
  const setState=state=>{window.piuraOfficeLighting=state;document.documentElement.dataset.officeLighting=JSON.stringify(state)};
  setState({status:'idle'});
  document.documentElement.dataset.officeControllerReady='10.1';
  document.addEventListener('piura:office-mode',()=>window.piuraSetOfficeMode(document.documentElement.dataset.officeModeRequest));
  function getController(){
    if(!ready)ready=new Promise((resolve,reject)=>{
      controller=document.createElement('iframe');controller.hidden=true;controller.title='Контроллер освещения';
      const timer=setTimeout(()=>reject(new Error('Контроллер освещения не загрузился')),10000);
      controller.onload=()=>{clearTimeout(timer);resolve(controller.contentWindow)};
      controller.src=new URL('piura-erp-restored%203/modules/Overview.html?lightingOnly=1&build=modes10',location.href).href;
      document.body.append(controller);
    });
    return ready;
  }
  window.piuraSetOfficeMode=mode=>{
    if(mode==='climate'||mode==='investments')mode='work';
    if(!Object.hasOwn(colors,mode))return false;
    if(window.piuraOfficeLighting?.mode===mode&&window.piuraOfficeLighting.status==='pending')return true;
    const request=crypto.randomUUID(),started=performance.now();
    setState({status:'pending',mode,color:colors[mode],brightness:100,request});
    // Serialize hardware commands: an older slow request cannot overwrite the
    // latest color. No command is sent simply by loading the ERP.
    queue=queue.catch(()=>{}).then(async()=>{
      const target=await getController();
      if(window.piuraOfficeLighting.request!==request)return;
      const devices=await target.piuraSetOfficeColor(colors[mode],100);
      if(window.piuraOfficeLighting.request!==request)return;
      setState({status:devices.every(x=>x.ok)?'done':'partial',mode,color:colors[mode],brightness:100,request,devices,durationSeconds:(performance.now()-started)/1000});
    }).catch(()=>{
      if(window.piuraOfficeLighting.request===request)setState({status:'failed',mode,request});
      ready=null;controller?.remove();
    });
    return true;
  };
})();
