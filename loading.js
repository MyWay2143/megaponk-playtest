(() => {
  const root=document.getElementById('loading'),fill=root.querySelector('.book-meter-fill'),percent=root.querySelector('.book-percent'),meter=root.querySelector('[role=progressbar]');
  let actual=0,engine=false,menu=false,opening=false,failed=false,booting=false,fillMotion,countMotion,finishStarted=false;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function shown(){const matrix=getComputedStyle(fill).transform;return matrix==='none'?0:Math.max(0,Math.min(1,new DOMMatrixReadOnly(matrix).a));}
  function animateTo(target,duration,easing='linear'){
    const from=shown();target=Math.max(from,target);
    if(fillMotion)fillMotion.cancel();if(countMotion)countMotion.cancel();
    fill.style.transform=`scaleX(${from})`;
    percent.style.setProperty('--load-percent',Math.floor(from*100));
    fillMotion=fill.animate([{transform:`scaleX(${from})`},{transform:`scaleX(${target})`}],{duration,fill:'forwards',easing});
    countMotion=percent.animate([{'--load-percent':Math.floor(from*100)},{'--load-percent':Math.floor(target*100)}],{duration,fill:'forwards',easing});
    percent.textContent=Math.floor(target*100)+'%';
    meter.setAttribute('aria-valuenow',String(Math.floor(from*100)));
    percent.setAttribute('aria-label','Подготовка игры');
    return fillMotion.finished.catch(()=>{});
  }
  function progress(p){
    if(failed||finishStarted)return;
    actual=Math.max(actual,Math.min(1,p));
    if(actual>=.89){
      if(!booting){booting=true;const current=shown();
        // Download is only one stage. Reserve visible progress for decompression,
        // WebAssembly initialization and the first rendered page; never estimate 100%.
        animateTo(.985,Math.max(16000,(.985-current)*48000),'cubic-bezier(.12,.25,.28,1)');}
    }else if(!booting){const target=actual/.9*.72;animateTo(target,Math.max(250,(target-shown())*8500));}
  }
  async function reveal(){
    if(!engine||!menu||finishStarted||failed)return;
    finishStarted=true;
    await animateTo(1,Math.min(3000,Math.max(450,(1-shown())*6500)));
    if(failed)return;
    percent.setAttribute('aria-label','Загружено 100 процентов');meter.setAttribute('aria-valuenow','100');
    await sleep(220);opening=true;
    await window.MegaPonkBook.open(root);
    root.hidden=true;document.getElementById('game').focus();
  }
  const nameKey='megaponk.nickname';
  const validName=value=>{const n=(value||'').trim().normalize();return n.length>=2&&n.length<=16&&/^[\p{L}\p{Nd}_-]+$/u.test(n)?n:null;};
  function remember(name){window.MegaPonkNickname=name;try{localStorage.setItem(nameKey,name)}catch{}}
  async function savedName(){
    try { const cached=validName(localStorage.getItem(nameKey));if(cached)return cached; } catch{}
    // Read the existing Unity preferences without starting or changing its filesystem.
    try {
      const databases=await indexedDB.databases();if(!databases.some(d=>d.name==='/idbfs'))return null;
      return await new Promise(resolve=>{
        let settled=false,db;const finish=value=>{if(settled)return;settled=true;if(db)db.close();resolve(value)};
        setTimeout(()=>finish(null),1800);
        const req=indexedDB.open('/idbfs');req.onerror=()=>finish(null);req.onsuccess=()=>{
          db=req.result;if(settled){db.close();return}if(!db.objectStoreNames.contains('FILE_DATA')){finish(null);return}
          const cursor=db.transaction('FILE_DATA').objectStore('FILE_DATA').openCursor();cursor.onerror=()=>finish(null);cursor.onsuccess=()=>{
            const c=cursor.result;if(!c){finish(null);return}
            if(String(c.key).endsWith('/preferences.json')){try{const name=validName(JSON.parse(new TextDecoder().decode(c.value.contents)).Nickname);if(name){finish(name);return}}catch{}}
            c.continue();
          };
        };
      });
    }catch{return null}
  }
  async function beforeLoad(start){
    const form=document.getElementById('nickname-form'),screen=document.getElementById('nickname-screen'),input=document.getElementById('nickname-input');
    let begun=false;function proceed(name){if(begun)return;begun=true;remember(name);screen.hidden=true;root.hidden=false;window.MegaPonkBook.align();start()}
    screen.hidden=false;
    const existing=await savedName();if(existing){proceed(existing);return}
    input.focus();form.onsubmit=event=>{event.preventDefault();const name=validName(input.value);if(!name){input.setCustomValidity('Введи от 2 до 16 букв или цифр');input.reportValidity();return}proceed(name)};
    input.oninput=()=>input.setCustomValidity('');
  }
  window.MegaPonkLoading={beforeLoad,remember,progress,
    engineReady:()=>{engine=true;progress(1);setTimeout(()=>{if(!menu)window.MegaPonkLoading.fail()},45000);reveal()},
    menuReady:()=>{menu=true;reveal()},
    fail:()=>{failed=true;if(fillMotion)fillMotion.pause();if(countMotion)countMotion.pause();document.getElementById('loading-error').hidden=false;}
  };
  document.getElementById('loading-retry').onclick=()=>location.reload();
})();
