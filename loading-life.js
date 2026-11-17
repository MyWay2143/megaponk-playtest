(() => {
  const root=document.getElementById('loading'),face=root.querySelector('.book-front');
  const width=940,height=1674,reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  canvas.className='cover-life';canvas.hidden=true;canvas.setAttribute('aria-hidden','true');
  face.insertBefore(canvas,face.querySelector('.book-meter'));
  const context=canvas.getContext('2d');
  let base,guests,fire,started=0,timer=0,frozen=false,ready=false;
  function image(name){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;const source=[...document.querySelectorAll('img[src],link[as="image"]')].map(e=>e.src||e.href).find(url=>new URL(url,location.href).pathname.endsWith('/'+name));i.src=source||name})}
  function surface(){const c=document.createElement('canvas');c.width=width;c.height=height;return c}
  function crop(c,image){c.drawImage(image,image.width*.052,0,image.width*.948,image.height,0,0,width,height)}
  function opacity(time,delay){const t=Math.max(0,Math.min(1,(time-delay)/.6));return t*t*(3-2*t)}
  // Shared scale and bottom anchor in the original 3-cell generated atlas.
  function guest(index,x,bottom,w,alpha,flip=false){
    const sw=guests.width/3,sh=guests.height,scale=w/sw,h=sh*scale;
    context.save();context.globalAlpha=alpha;
    const shadow=context.createRadialGradient(x,bottom+5,0,x,bottom+5,w*.30);
    shadow.addColorStop(0,'#21101a99');shadow.addColorStop(1,'#21101a00');
    context.fillStyle=shadow;context.save();context.translate(x,bottom+5);context.scale(1,.19);context.translate(-x,-bottom-5);context.fillRect(x-w*.32,bottom+5-w*.32,w*.64,w*.64);context.restore();
    context.translate(x,bottom-sh*.905*scale);if(flip)context.scale(-1,1);
    context.drawImage(guests,index*sw,0,sw,sh,-w/2,0,w,h);context.restore();
  }
  function flame(index,alpha){const sw=fire.width/2,sh=fire.height/2,w=330,h=w*sh/sw;context.save();context.globalAlpha=alpha;context.drawImage(fire,(index%2)*sw,Math.floor(index/2)*sh,sw,sh,525-w/2,1072-h*.90,w,h);context.restore()}
  function paint(time){
    if(!ready)return;
    context.clearRect(0,0,width,height);context.drawImage(base,0,0);
    const all=reduced.matches;
    guest(2,792,1012,270,all?1:opacity(time,1.8),true);
    guest(0,285,1108,342,all?1:opacity(time,.25));
    guest(1,648,1122,276,all?1:opacity(time,1.05));
    const phase=all?0:(time/.22)%4,frame=Math.floor(phase),blend=Math.max(0,(phase-frame-.72)/.28);
    flame(frame,1-blend);if(blend)flame((frame+1)%4,blend);
    canvas.dataset.fireFrame=String(frame);canvas.dataset.guestCount=String([.25,1.05,1.8].filter(delay=>all||time>=delay+.6).length);
  }
  function tick(){if(frozen||root.hidden||!ready)return;if(!started)started=performance.now();paint((performance.now()-started)/1000);canvas.hidden=false;if(!reduced.matches)timer=setTimeout(tick,1000/24)}
  function sync(){clearTimeout(timer);if(!root.hidden&&!frozen&&ready)tick()}
  const observer=new MutationObserver(sync);observer.observe(root,{attributes:true,attributeFilter:['hidden']});
  Promise.all([image('loading-cover.jpg'),image('loading-clearing.png'),image('loading-guests.png'),image('loading-fire.png')]).then(([cover,clearing,g,f])=>{
    guests=g;fire=f;base=surface();const b=base.getContext('2d');crop(b,cover);
    // Only inpaint the old hero/flame area; original border, title and loader remain byte-for-byte source art.
    const patch=surface(),p=patch.getContext('2d');crop(p,clearing);
    const mask=surface(),m=mask.getContext('2d');m.filter='blur(16px)';m.fillStyle='#fff';m.beginPath();m.ellipse(405,890,243,276,0,0,Math.PI*2);m.ellipse(590,875,170,285,0,0,Math.PI*2);m.fill();
    p.globalCompositeOperation='destination-in';p.drawImage(mask,0,0);b.drawImage(patch,0,0);
    ready=true;sync();
  }).catch(error=>console.warn('Cover scene unavailable',error));
  window.MegaPonkCoverLife={
    get ready(){return ready},
    freeze(){frozen=true;clearTimeout(timer);observer.disconnect();return ready?canvas:null},
    drawAt:paint
  };
})();
