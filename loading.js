(() => {
  const root=document.getElementById('loading'),fill=root.querySelector('.book-meter-fill'),percent=root.querySelector('.book-percent'),meter=root.querySelector('[role=progressbar]');
  let progress=0,engine=false,menu=false,opening=false;
  function set(value){progress=Math.max(progress,Math.min(1,value));const n=Math.floor(progress*100);fill.style.width=(progress*100)+'%';percent.textContent=n+'%';meter.setAttribute('aria-valuenow',String(n));}
  async function reveal(){
    if(!engine||!menu||opening)return;
    opening=true;set(1);
    // Keep the 100% state visible, then turn the cover off the already rendered first page.
    await new Promise(r=>setTimeout(r,300));
    root.classList.add('opening');
    await new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion:reduce)').matches?80:1200));
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
    let begun=false;function proceed(name){if(begun)return;begun=true;remember(name);screen.hidden=true;root.hidden=false;start()}
    screen.hidden=false;
    const existing=await savedName();if(existing){proceed(existing);return}
    input.focus();form.onsubmit=event=>{event.preventDefault();const name=validName(input.value);if(!name){input.setCustomValidity('Введи от 2 до 16 букв или цифр');input.reportValidity();return}proceed(name)};
    input.oninput=()=>input.setCustomValidity('');
  }
  window.MegaPonkLoading={beforeLoad,remember,progress:p=>set(p*.95),engineReady:()=>{engine=true;set(.97);setTimeout(()=>{if(!menu)window.MegaPonkLoading.fail()},45000);reveal()},menuReady:()=>{menu=true;reveal()},fail:()=>{const error=document.getElementById('loading-error');error.hidden=false;}};
  document.getElementById('loading-retry').onclick=()=>location.reload();
})();
