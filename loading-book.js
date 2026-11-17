(() => {
  const stage=document.querySelector('.book-stage'),face=stage.querySelector('.book-front');
  const quad=[[18,94],[490,72],[542,886],[21,926]],size=[540,960];
  function homography(w,h,q){
    const src=[[0,0],[w,0],[w,h],[0,h]],a=[];
    src.forEach(([x,y],i)=>{const [u,v]=q[i];a.push([x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v])});
    for(let i=0;i<8;i++){let pivot=i;for(let j=i+1;j<8;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;[a[i],a[pivot]]=[a[pivot],a[i]];const divisor=a[i][i];for(let k=i;k<9;k++)a[i][k]/=divisor;for(let j=0;j<8;j++)if(j!==i){const f=a[j][i];for(let k=i;k<9;k++)a[j][k]-=f*a[i][k]}}
    return [...a.map(row=>row[8]),1];
  }
  function inverse(m){const [a,b,c,d,e,f,g,h,i]=m,det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);return [(e*i-f*h),(c*h-b*i),(b*f-c*e),(f*g-d*i),(a*i-c*g),(c*d-a*f),(d*h-e*g),(b*g-a*h),(a*e-b*d)].map(x=>x/det)}
  function align(){const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;const m=homography(w,h,quad.map(([x,y])=>[x*w/540,y*h/960]));face.style.transform=`matrix3d(${[m[0],m[3],0,m[6],m[1],m[4],0,m[7],0,0,1,0,m[2],m[5],0,1].join(',')})`}
  new ResizeObserver(align).observe(stage);
  function asset(name){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;const source=[...document.querySelectorAll('img[src],link[as="image"]')].map(e=>e.src||e.href).find(url=>new URL(url,location.href).pathname.endsWith('/'+name));image.src=source||name})}
  const assets=Promise.all([asset('loading-cover.jpg'),asset('loading-book.jpg'),asset('loading-leaf.png'),asset('loading-verso.jpg'),asset('loading-hinge.png')]);
  // Same cylindrical inverse projection and constants as AtlasPageCurl.hlsl / AtlasPageTurn.SetProgress.
  const fragment=`#version 300 es
precision highp float;
uniform sampler2D uPrint,uBook,uMask,uVerso,uBinding;
uniform mat3 uInverse;
uniform vec2 uResolution,uOrigin,uSize;
uniform vec4 uFold,uMotion;
out vec4 color;
float sat(float x){return clamp(x,0.0,1.0);}vec2 sat(vec2 x){return clamp(x,vec2(0.0),vec2(1.0));}
vec3 readPrint(vec2 uv,float lod){vec3 p=uInverse*vec3(uv*vec2(540.0,960.0),1.0);vec2 local=p.xy/p.z/vec2(540.0,960.0);if(all(greaterThanEqual(local,vec2(0.0)))&&all(lessThanEqual(local,vec2(1.0))))return textureLod(uPrint,local,lod).rgb;return textureLod(uBook,uv,lod).rgb;}
vec3 readVerso(vec2 uv){
  vec2 tiled=1.0-abs(fract(uv*vec2(540.0/512.0,960.0/656.0))*2.0-1.0);
  float grain=dot(texture(uVerso,tiled).rgb,vec3(.299,.587,.114));
  vec3 p=uInverse*vec3(uv*vec2(540.0,960.0),1.0);vec2 local=p.xy/p.z/vec2(540.0,960.0);
  float edge=min(min(local.x,1.0-local.x),min(local.y,1.0-local.y));
  vec3 leather=vec3(.24,.105,.047)*(.72+grain*.75);
  vec3 wood=vec3(.19,.078,.035)*(.65+grain*.65);
  vec3 back=mix(wood,leather,smoothstep(.025,.048,edge));
  float trim=1.0-smoothstep(.0015,.004,abs(edge-.037));
  return mix(back,vec3(.47,.29,.10)*(.7+grain*.3),trim*.7);
}
// The cover includes its wooden frame. A parchment-leaf mask cuts that frame off.
float paperCoverage(vec2 uv){
  vec3 p=uInverse*vec3(uv*vec2(540.0,960.0),1.0);
  vec2 local=p.xy/p.z/vec2(540.0,960.0);
  vec2 edge=min(local,1.0-local)*vec2(540.0,960.0);
  return sat(min(edge.x,edge.y)/max(uMotion.w,1.0)+.5);
}
// Inverse projection of a sheet rolling around a diagonal cylinder.
// All distances use the portrait UI's 540.0 x 960.0 design units.
vec2 leafPoint(vec2 normal, float crease, float along, float tangent, float lift)
{
    vec2 pt = normal * (crease + along) + vec2(-normal.y, normal.x) * (tangent + .18 * lift);
    pt.y += 480.0;
    return pt;
}

float edgeCoverage(vec2 pt, float pixel)
{
    vec2 edges = min(pt - vec2(22.0,0.0), vec2(540.0,960.0) - pt);
    return sat(min(edges.x, edges.y) / pixel + .5);
}

vec4 atlasCurl(vec2 uv, vec4 fold, vec4 motion)
{
    vec2 size = vec2(540.0,960.0);
    vec2 screen = uv * size;
    float e = motion.x, pixel = motion.w;
    bool insideFrame = all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0)));
    if (e <= 0.0)
    {
        float alpha = insideFrame ? (motion.z > .5 ? paperCoverage(uv) : 1.0) : 0.0;
        return vec4(readPrint(sat(uv),0.0)*alpha,alpha);
    }
    if (e >= 1.0 && motion.z < .5) return vec4(0.0,0.0,0.0,0.0);
    vec2 P = vec2(screen.x, screen.y-480.0);
    vec2 normal = fold.xy;
    // The illustrated spine is slightly bowed: about x=30.0 in the middle and x=37.0 at its ends.
    float settled = motion.z * smoothstep(.75, 1.0, e);
    float crease = fold.w + settled * 0.00005 * P.y * P.y;
    float d = dot(P, normal) - crease;
    float tangent = dot(P, vec2(-normal.y, normal.x));
    float r = fold.z, dist = max(d-r, 0.0);
    float width = r*.32 + 4.0;
    if (e >= 1.0 && dist > 18.0 * width) return vec4(0.0,0.0,0.0,0.0);
    float shadow = motion.y * (.20*exp(-dist/width) + .16*exp(-dist/(width*2.8)));
    // Premultiplied black shades the live destination directly under the sheet.
    vec4 result = vec4(0.0,0.0,0.0,shadow);
    if (motion.z > .5)
    {
        // Only the physical sheet casts a shadow. The desk and HUD are live
        // underneath, so drawing the captured frame here would double-expose them.
        result.a = insideFrame ? shadow * paperCoverage(uv) : 0.0;
    }
    if (d < r + pixel)
    {
        float sine = sat(d/r);
        float angle = asin(sine);
        float cosine = sqrt(max(0.0, 1.0-sine*sine));
        float crest = sat((r-d)/pixel + .5);
        vec2 front = leafPoint(normal, crease, d<=0.0 ? d : r*angle, tangent, r*(1.0-cosine));
        float coverage = edgeCoverage(front,pixel);
        if (motion.z > .5) coverage *= paperCoverage(front/size);
        // The print foreshortens at the crest. Filter that narrow strip without blurring the flat page.
        float lod = -log2(max(cosine,.0625));
        vec3 print = readPrint(front/size,lod) * (1.0-.21*sine);
        vec4 leaf = mix(result, vec4(print,1.0), coverage);

        float backAngle = 3.14159265-angle;
        vec2 back = leafPoint(normal, crease, d<=0.0 ? 3.14159265*r-d : r*backAngle, tangent, r*(1.0+cosine));
        vec2 backUv = back/size;
        vec2 margin = min(back,size-back);
        float border = min(margin.x,margin.y);
        float glint = (backAngle-2.06)/.32;
        float lighting = d<=0.0 ? .96 : .94-.18*sine+.16*exp(-glint*glint);
        lighting *= 1.0-.24*exp(-max(0.0,border)/1.7);
        float emboss = sat(1.0-min(abs(border-10.0),abs(border-13.0))/max(pixel,1.0));
        vec3 parchment = readVerso(backUv) * lighting * (1.0-.14*emboss);
        float backCoverage = edgeCoverage(back,pixel);
        if (motion.z > .5) backCoverage *= paperCoverage(backUv);
        leaf = mix(leaf,vec4(parchment,1.0),backCoverage);
        result = mix(result,leaf,crest);
    }
    if (motion.z > .5)
    {
        // At rest the turned leaf meets the head and foot of the binding. Follow the
        // actual cover silhouette there; leave the raised cover free during the turn.
        float spineSampleX = clamp(45.0 + (35.0 - screen.x) * .85, 45.0, 480.0);
        float spineHeight = paperCoverage(vec2(spineSampleX / size.x, sat(uv.y)));
        return result * mix(1.0, spineHeight, settled);
    }
    float binding = 1.0-smoothstep(19.0,24.0,screen.x);
    if (binding>0.0) result = mix(result,vec4(readPrint(uv,0.0)*(1.0-e),1.0-e),binding);
    return result;
}

void main(){vec2 pixel=vec2(gl_FragCoord.x,uResolution.y-gl_FragCoord.y);vec2 uv=(pixel-uOrigin)/uSize;
color=atlasCurl(uv,uFold,uMotion);
// Reveal the stationary native binding; never draw a second copy on the sheet.
float cap=(1.0-smoothstep(.056,.074,uv.x))*texture(uBinding,clamp(uv,0.0,1.0)).a;
color*=1.0-cap;}
`;
  function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
  async function open(root){
    const liveCover=window.MegaPonkCoverLife?.freeze();
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){root.classList.add('opening');return}
    let canvas,gl;
    try{
      const [cover,book,mask,verso,binding]=await assets;
      const print=document.createElement('canvas');print.width=940;print.height=1674;const c=print.getContext('2d');
      if(liveCover)c.drawImage(liveCover,0,0,940,1674);
      else c.drawImage(cover,cover.width*.052,0,cover.width*.948,cover.height,0,0,940,1674);
      const gradient=c.createLinearGradient(0,1350,0,1393);gradient.addColorStop(0,'#cf6708');gradient.addColorStop(.35,'#ffe290');gradient.addColorStop(1,'#b74d05');c.fillStyle=gradient;c.beginPath();c.roundRect(.0791*940,.8065*1674,.7901*940,.0255*1674,18);c.fill();
      c.fillStyle='#351b09';c.font='bold 60px Georgia';c.textAlign='center';c.textBaseline='middle';c.fillText('100%',(.3354+.2743/2)*940,(.851+.051/2)*1674);
      canvas=document.createElement('canvas');canvas.className='book-curl';root.appendChild(canvas);gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false});if(!gl)throw Error('No WebGL2');
      const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0,1);}'));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      [print,book,mask,verso,binding].forEach((image,index)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.uniform1i(gl.getUniformLocation(program,['uPrint','uBook','uMask','uVerso','uBinding'][index]),index)});
      const inv=inverse(homography(540,960,quad));gl.uniformMatrix3fv(gl.getUniformLocation(program,'uInverse'),false,new Float32Array([inv[0],inv[3],inv[6],inv[1],inv[4],inv[7],inv[2],inv[5],inv[8]]));
      const smooth=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
      function draw(time){
        const dpr=Math.min(devicePixelRatio||1,2),rect=stage.getBoundingClientRect();canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);gl.viewport(0,0,canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(program,'uResolution'),canvas.width,canvas.height);gl.uniform2f(gl.getUniformLocation(program,'uOrigin'),rect.left*dpr,rect.top*dpr);gl.uniform2f(gl.getUniformLocation(program,'uSize'),rect.width*dpr,rect.height*dpr);
        const t=smooth(time),slope=mix(.325,0,t),length=Math.hypot(1,slope),nx=1/length,ny=slope/length,arc=Math.max(0,Math.sin(t*Math.PI));let radius=540*(.047+.104*Math.pow(arc,.85));radius=mix(radius,13,smooth(Math.max(0,Math.min(1,(t-.75)/.25))));const crease=mix(nx*539+ny*480,-100,t);let shadow=smooth(Math.min(1,t/.12))*smooth(Math.min(1,(1-t)/.13));shadow=Math.max(shadow,.35*t);
        gl.uniform4f(gl.getUniformLocation(program,'uFold'),nx,ny,radius,crease);gl.uniform4f(gl.getUniformLocation(program,'uMotion'),t,shadow,1,540/(rect.width*dpr));gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);
      }
      draw(0);root.classList.add('opening');window.MegaPonkBook.draw=draw;
      await new Promise(resolve=>{const begin=performance.now();function frame(now){const t=Math.min(1,(now-begin)/820);draw(t);if(t<1)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});
      // The same binding is already rendered by Unity. No cross-fade or delayed replacement.
      // Finish with the cover entirely outside the viewport before releasing the loader.
      root.dataset.coverOpen='true';
    }catch(error){console.warn('Book opening fallback',error);await root.animate([{opacity:1},{opacity:0}],{duration:350,fill:'forwards'}).finished}
    finally{if(canvas)canvas.remove();if(gl)gl.getExtension('WEBGL_lose_context')?.loseContext()}
  }
  window.MegaPonkBook={align,open};
})();
