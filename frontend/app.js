const $=s=>document.querySelector(s),COL={normal:'#34D399',watch:'#FACC15',warning:'#FF7A3D',critical:'#EF4444'},
IC={normal:'✓',watch:'◆',warning:'▲',critical:'⚠'},LB={normal:'Normal',watch:'Watch',warning:'Warning',critical:'Critical'},
CH={stable:['Stable','✓','#34D399'],watch:['Watch','◆','#FACC15'],alert:['Alert','▲','#FF7A3D']},
NAV=[['home','⌂','Home'],['checkin','✎','Check-in'],['body','☍','Body Map'],['radiation','☢','Radiation'],['gravity','⇩','Gravity'],['immune','✚','Immune'],['mind','☾','MindSpace'],['habitat','▣','Habitat'],['companion','◉','Companion'],['research','⚗','Research']],
HZ=['all','radiation','gravity','immune','mind','habitat'],
CMDS=['How am I doing today?','Explain my radiation level','Show my body map','I feel lonely','Open my daily check-in'],
ORDER=l=>['normal','watch','warning','critical'].indexOf(l),phone=()=>innerWidth<900,SR=window.SpeechRecognition||window.webkitSpeechRecognition;
let S,day=142,screen='home',sel=null,flt='all',LOG=[],muted=false,rsel='legs',speaking=false,rec,wasPhone=phone(),voiceAudio=null,voiceUrl=null,voiceRequest=0,voiceController=null;

/* =====================================================================
   TRUE 3D HOLOGRAM BODY MAP  (canvas, no libraries, full 360° rotation)
   - The body is a 3D model built from elliptical cross-sections
   - Drag left/right to spin it, release for inertia
   - Markers are anchored in 3D and rotate with the body
   - Selecting a marker turns the body to face it
   ===================================================================== */
const BM={rot:0,vel:0,target:null,auto:true,idleAt:0,dragging:false,lastX:0,moved:0,hits:[],hover:false,lastSel:null,t0:0,raf:0,cv:null,
  p:{markers:[],sel:null,flt:'all',home:false}};

/* ---- 3D model: every part is a stack of slices {y, rx, rz, cx, cz} (metres, y=0 floor, ~1.85 m tall, +z = front) ---- */
const BMP=(()=>{
  const keyed=(keys,sg=1,step=.012)=>{const o=[],top=keys[0][0],bot=keys[keys.length-1][0];
    for(let y=top;y>bot+1e-6;y-=step){let i=0;while(i<keys.length-2&&y<keys[i+1][0])i++;
      const a=keys[i],b=keys[i+1],t=Math.max(0,Math.min(1,(a[0]-y)/((a[0]-b[0])||1))),L=k=>(a[k]||0)+((b[k]||0)-(a[k]||0))*t;
      o.push({y,rx:L(1),rz:L(2),cx:L(3)*sg,cz:L(4)})}
    const e=keys[keys.length-1];o.push({y:e[0],rx:e[1],rz:e[2],cx:(e[3]||0)*sg,cz:e[4]||0});return o};
  const ell=(cx,cy,cz,rx,ry,rz,n=18)=>{const o=[];for(let i=0;i<=n;i++){const a=Math.PI*i/n,s=Math.sin(a);o.push({y:cy+ry*Math.cos(a),rx:rx*s,rz:rz*s,cx,cz})}return o};
  const parts=[],add=(sl,ring)=>{const n=sl.length;parts.push({sl,ring,i:parts.length,mcx:sl.reduce((a,q)=>a+q.cx,0)/n,mcz:sl.reduce((a,q)=>a+q.cz,0)/n})};
  const leg=[[.93,.098,.10,.092,0],[.78,.092,.095,.088,0],[.62,.075,.082,.083,0],[.50,.058,.068,.080,0],[.40,.058,.068,.078,-.005],[.30,.056,.065,.074,-.01],[.15,.04,.045,.07,0],[.07,.034,.04,.07,0]];
  const arm=[[1.44,.062,.064,.215,0],[1.30,.052,.056,.248,0],[1.17,.045,.05,.275,0],[1.05,.043,.047,.298,.01],[.93,.034,.036,.318,.01],[.86,.026,.028,.332,.01]];
  add(keyed(leg,-1),3);add(keyed(leg,1),3);
  add(keyed([[1.52,.055,.06,0,0],[1.49,.15,.075,0,0],[1.45,.205,.10,0,0],[1.38,.185,.115,0,.005],[1.28,.165,.12,0,.01],[1.15,.15,.105,0,0],[1.03,.158,.105,0,-.005],[.92,.17,.11,0,-.005],[.83,.15,.10,0,0]]),3);
  add(keyed([[1.60,.048,.052,0,.005],[1.50,.056,.06,0,0]]),3);
  add(ell(0,1.70,.01,.085,.115,.10,22),1);
  add(keyed(arm,-1),3);add(keyed(arm,1),3);
  add(ell(-.342,.79,.012,.034,.075,.017,14),2);add(ell(.342,.79,.012,.034,.075,.017,14),2);
  add(ell(-.075,.04,.05,.042,.04,.11,12),2);add(ell(.075,.04,.05,.042,.04,.11,12),2);
  /* volumetric sparkle points inside the body */
  const all=[];parts.forEach(p=>p.sl.forEach(q=>{if(q.rx>.01)all.push(q)}));
  const pts=[];for(let i=0;i<170;i++){const q=all[Math.floor(Math.random()*all.length)],a=Math.random()*6.2832,r=Math.sqrt(Math.random())*.9;
    pts.push({x:q.cx+q.rx*r*Math.cos(a),y:q.y,z:q.cz+q.rz*r*Math.sin(a),s:Math.random()*1+.7,o:Math.random()*6})}
  return{parts,pts}
})();

/* z (depth) of the front skin at a given x,y so markers sit exactly on the body surface */
function bmSurfZ(x,y){let best=null;
  for(const p of BMP.parts){const sl=p.sl;if(y>sl[0].y+.005||y<sl[sl.length-1].y-.005)continue;
    let q=sl[0],bd=9;for(const k of sl){const d=Math.abs(k.y-y);if(d<bd){bd=d;q=k}}
    const u=(x-q.cx)/(q.rx||1);if(Math.abs(u)<1){const z=q.cz+q.rz*Math.sqrt(1-u*u);if(best===null||z>best)best=z}}
  return best===null?.08:best}
const bmMz=m=>m.pos[2]!=null?m.pos[2]:bmSurfZ(m.pos[0],m.pos[1]);

/* ---- renderer ---- */
function bmDraw(cv,t){
  const dpr=cv._dpr,ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  const w=cv.width/dpr,h=cv.height/dpr;ctx.clearRect(0,0,w,h);
  const P=BM.p,home=P.home,th=BM.rot,c=Math.cos(th),s=Math.sin(th),PI=.18,cp=Math.cos(PI),sp=Math.sin(PI);
  const sc=Math.min(h*(home?.82:.78)/1.85,w*.9/.82),ox=w/2,floor=h*(home?.93:.9),bob=Math.sin(t/900)*2.5,oy=floor-.05*sc+bob;

  /* holographic projector base */
  ctx.save();ctx.translate(ox,floor);
  [[.52,.9,.35,0],[.38,1.4,.6,10],[.22,2,.95,14]].forEach(([r,lw,a,b])=>{ctx.beginPath();ctx.ellipse(0,0,r*sc,r*sc*.2,0,0,6.2832);ctx.strokeStyle='rgba(215,248,255,'+a+')';ctx.lineWidth=lw;ctx.shadowColor='#9BF0FF';ctx.shadowBlur=b;ctx.stroke()});
  ctx.shadowBlur=0;ctx.setLineDash([6,10]);ctx.lineDashOffset=-th*sc*.3;ctx.beginPath();ctx.ellipse(0,0,.62*sc,.62*sc*.2,0,0,6.2832);ctx.strokeStyle='rgba(215,248,255,.55)';ctx.lineWidth=1.2;ctx.stroke();ctx.restore();

  /* project every body part to a screen polygon */
  const polys=[];
  for(const p of BMP.parts){const L=[],R=[];let x0=1e9,x1=-1e9;
    for(const q of p.sl){const zc=-q.cx*s+q.cz*c,X=ox+(q.cx*c+q.cz*s)*sc,W=Math.hypot(q.rx*c,q.rz*s)*sc,Y=oy-(q.y*cp-zc*sp)*sc;
      L.push(X-W,Y);R.push(X+W,Y);if(X-W<x0)x0=X-W;if(X+W>x1)x1=X+W}
    polys.push({p,L,R,x0,x1,d:Math.round((-p.mcx*s+p.mcz*c)*50)/50})}
  polys.sort((a,b)=>a.d-b.d||a.p.i-b.p.i);
  const trace=(g,pt)=>{pt.moveTo(g.L[0],g.L[1]);for(let i=2;i<g.L.length;i+=2)pt.lineTo(g.L[i],g.L[i+1]);for(let i=g.R.length-2;i>=0;i-=2)pt.lineTo(g.R[i],g.R[i+1]);pt.closePath()};
  const all=new Path2D();polys.forEach(g=>trace(g,all));

  /* glowing outline (like the reference image), then shaded solid parts far -> near */
  ctx.save();ctx.lineJoin='round';ctx.shadowColor='rgba(120,230,255,.95)';ctx.shadowBlur=16;ctx.strokeStyle='#bff3ff';ctx.lineWidth=5;ctx.stroke(all);ctx.restore();
  for(const g of polys){const pt=new Path2D();trace(g,pt);
    const gr=ctx.createLinearGradient(g.x0,0,g.x1,0);gr.addColorStop(0,'#0a3a8c');gr.addColorStop(.38,'#2a8ae6');gr.addColorStop(.7,'#1c6fd2');gr.addColorStop(1,'#08357f');
    ctx.fillStyle=gr;ctx.fill(pt);ctx.strokeStyle='rgba(160,230,255,.28)';ctx.lineWidth=1;ctx.stroke(pt)}

  /* inner hologram: contour rings (show the rotation), sparkles, scan band */
  ctx.save();ctx.clip(all);
  const fr=new Path2D(),bk=new Path2D();
  for(const g of polys){const p=g.p;
    for(let i=0;i<p.sl.length;i+=p.ring){const q=p.sl[i];if(q.rx<.012)continue;let pf=false,pb=false;
      for(let k=0;k<=28;k++){const a=k/28*6.2832,lx=q.cx+q.rx*Math.cos(a),lz=q.cz+q.rz*Math.sin(a),zp=-lx*s+lz*c,X=ox+(lx*c+lz*s)*sc,Y=oy-(q.y*cp-zp*sp)*sc;
        if(zp>0){if(pf)fr.lineTo(X,Y);else{fr.moveTo(X,Y);pf=true}pb=false}else{if(pb)bk.lineTo(X,Y);else{bk.moveTo(X,Y);pb=true}pf=false}}}}
  ctx.lineWidth=1;ctx.strokeStyle='rgba(190,240,255,.10)';ctx.stroke(bk);ctx.strokeStyle='rgba(190,240,255,.32)';ctx.stroke(fr);
  for(const q of BMP.pts){const zp=-q.x*s+q.z*c,X=ox+(q.x*c+q.z*s)*sc,Y=oy-(q.y*cp-zp*sp)*sc,
    a=(.25+.55*Math.max(0,Math.min(1,(zp+.12)/.24)))*(.65+.35*Math.sin(t/420+q.o));
    ctx.fillStyle='rgba(215,248,255,'+a.toFixed(3)+')';ctx.fillRect(X,Y,q.s,q.s)}
  const sy=oy-(1.85-(t%3400)/3400*1.85)*sc,sg=ctx.createLinearGradient(0,sy-16,0,sy);sg.addColorStop(0,'rgba(150,240,255,0)');sg.addColorStop(1,'rgba(150,240,255,.5)');
  ctx.fillStyle=sg;ctx.fillRect(ox-sc,sy-16,2*sc,16);ctx.fillStyle='rgba(235,252,255,.9)';ctx.fillRect(ox-sc,sy,2*sc,1.5);
  ctx.restore();

  /* health markers (anchored in 3D) */
  BM.hits=[];
  for(const m of P.markers){
    if(!m.pos||(P.flt!=='all'&&!(m.hazards||[]).includes(P.flt)))continue;
    const mx=m.pos[0],my=m.pos[1],mz=m.pos[2]!=null?m.pos[2]:bmSurfZ(mx,my)+.004,
      zp=-mx*s+mz*c,X=ox+(mx*c+mz*s)*sc,Y=oy-(my*cp-zp*sp)*sc,col=COL[m.level],on=P.sel===m.id,front=zp>-.01;
    ctx.save();
    if(front&&(m.level=='warning'||m.level=='critical')){const k=(t/1100+mx*3)%1;ctx.globalAlpha=.45*(1-k);ctx.beginPath();ctx.arc(X,Y,7+16*k,0,6.2832);ctx.fillStyle=col;ctx.fill()}
    ctx.globalAlpha=front?1:.2;
    if(on){ctx.setLineDash([4,3]);ctx.lineDashOffset=-t/50;ctx.beginPath();ctx.arc(X,Y,12,0,6.2832);ctx.strokeStyle='#fff';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([])}
    ctx.shadowColor=col;ctx.shadowBlur=front?10:0;ctx.beginPath();ctx.arc(X,Y,on?6.5:4.8,0,6.2832);ctx.fillStyle=col;ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle='#030712';ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
    if(front)BM.hits.push({id:m.id,x:X,y:Y})}

  if(!home){ctx.fillStyle='rgba(255,255,255,.85)';ctx.font='600 11px system-ui,sans-serif';ctx.textAlign='right';
    ctx.fillText('ROT '+String(Math.round(((th*180/Math.PI)%360+360)%360)).padStart(3,'0')+'°',w-12,20)}
}

/* ---- animation loop (looks up the current canvas each frame, so re-renders are safe) ---- */
function bmFrame(t){
  BM.raf=requestAnimationFrame(bmFrame);
  const cv=document.getElementById('body-canvas');if(!cv||document.hidden)return;
  const dt=Math.min(.05,(t-(BM.t0||t))/1000);BM.t0=t;
  const r=cv.getBoundingClientRect();if(r.width<10||r.height<10)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),W=Math.round(r.width*dpr),H=Math.round(r.height*dpr);
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H}cv._dpr=dpr;
  const P=BM.p;
  if(P.sel!==BM.lastSel){BM.lastSel=P.sel;const m=P.sel&&P.markers.find(x=>x.id==P.sel);if(m&&m.pos)BM.target=bmMz(m)>=0?0:Math.PI}
  if(BM.target!=null){let d=BM.target-BM.rot;d=Math.atan2(Math.sin(d),Math.cos(d));BM.rot+=d*Math.min(1,dt*8);if(Math.abs(d)<.004){BM.rot=BM.target;BM.target=null}}
  else if(!BM.dragging){BM.rot+=BM.vel;BM.vel*=.93;if(Math.abs(BM.vel)<2e-4)BM.vel=0;
    if(BM.auto&&!BM.vel&&t>BM.idleAt&&!P.sel&&!BM.hover)BM.rot+=dt*.55}
  BM.rot%=6.2832;
  bmDraw(cv,t)
}

/* ---- interaction: drag to rotate, tap a marker to select ---- */
document.addEventListener('pointerdown',e=>{const cv=e.target;if(!cv||cv.id!=='body-canvas')return;
  BM.dragging=true;BM.moved=0;BM.lastX=e.clientX;BM.vel=0;BM.target=null;BM.cv=cv;cv.style.cursor='grabbing';try{cv.setPointerCapture(e.pointerId)}catch(_){}});
document.addEventListener('pointermove',e=>{
  if(BM.dragging){const dx=e.clientX-BM.lastX;BM.lastX=e.clientX;BM.moved+=Math.abs(dx);BM.rot+=dx*.012;BM.vel=dx*.012;return}
  const cv=e.target;if(cv&&cv.id==='body-canvas'){const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,hit=BM.hits.find(k=>Math.hypot(k.x-x,k.y-y)<16);
    BM.hover=!!hit;cv.style.cursor=hit?'pointer':'grab'}else BM.hover=false});
const bmUp=e=>{if(!BM.dragging)return;BM.dragging=false;BM.idleAt=performance.now()+3500;
  const cv=BM.cv;if(cv)cv.style.cursor='grab';
  if(BM.moved<6&&cv&&e.type=='pointerup'){const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    let b=null,bd=20;for(const k of BM.hits){const d=Math.hypot(k.x-x,k.y-y);if(d<bd){bd=d;b=k}}
    if(b){sel=b.id;go('body',screen=='body')}}};
document.addEventListener('pointerup',bmUp);document.addEventListener('pointercancel',bmUp);
window.bmView=a=>{BM.target=a;BM.vel=0;BM.idleAt=performance.now()+4000};
window.bmAuto=()=>{BM.auto=!BM.auto;const b=document.getElementById('bm-auto');if(b)b.classList.toggle('on',BM.auto)};

const stChip=l=>`<span class="st" style="color:${COL[l]}; border-color:${COL[l]}33; background:${COL[l]}11">${IC[l]} ${LB[l]}</span>`,
modChip=c=>{const[a,b,k]=CH[c];return `<span class="st" style="color:${k}; border-color:${k}33; background:${k}11">${b} ${a}</span>`};

function chart(v,col,h=90){
    const mn=Math.min(...v),mx=Math.max(...v),r=(mx-mn)||1,p=v.map((y,i)=>`${i*(300/(v.length-1))},${h-8-(y-mn)/r*(h-24)}`).join(' ');
    return `<svg viewBox="0 0 300 ${h}" width="100%"><defs><linearGradient id="grad_${col.replace('#','')}" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="${col}" stop-opacity="0.3"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><polyline points="${p}" fill="none" stroke="${col}" stroke-width="3" stroke-linejoin="round" style="filter: drop-shadow(0 0 6px ${col})"/><text x="0" y="12" fill="#94A3B8" font-size="11" font-weight="500">${mx}</text><text x="0" y="${h-1}" fill="#94A3B8" font-size="11" font-weight="500">${mn}</text></svg>`
}
const met=m=>`<div class="card"><h3>${m.label}</h3><div class="val">${m.value} <small>${m.unit}</small></div>${stChip(m.level)}${chart(m.series,COL[m.level])}<small style="color:var(--mut); display:block; margin-top:8px;">last 14 days</small></div>`;
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2600)}

/* ---------- BODY MAP VIEW (same function name/signature as before) ---------- */
function getBodySVG(markers, selectedId, filter, isHome = false) {
    BM.p = { markers: markers || [], sel: selectedId, flt: filter, home: isHome };
    return `
    <div class="bm-wrap" style="position:relative; width:100%; height:${isHome ? '340px' : '560px'}; border-radius:14px; overflow:hidden; background:linear-gradient(180deg,#1b4f9f 0%,#2f86d6 28%,#5ccbf5 55%,#3b9be0 80%,#1f5fb4 100%);">

        <canvas id="body-canvas" style="position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:pan-y; cursor:grab;"></canvas>

        <!-- Floating HUD panels -->
        <div style="position:absolute; left:10px; top:15%; display:${isHome ? 'none' : 'flex'}; flex-direction:column; gap:10px; z-index:10; pointer-events:none;">
            <div class="hud-box">
                <div class="hud-title">MOVEMENT</div>
                <svg viewBox="0 0 80 20" width="100%" height="20"><path d="M0 10 L10 10 L15 5 L20 15 L25 10 L40 10 L45 2 L50 18 L55 10 L80 10" fill="none" stroke="#22D3EE" stroke-width="1.5"/></svg>
            </div>
            <div class="hud-box">
                <div class="hud-title">HEART RATE</div>
                <div style="display:flex; align-items:center; gap:5px;">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="#22D3EE"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    <span style="font-size:16px; font-weight:700; color:#fff;">72 <small style="font-size:9px;">BPM</small></span>
                </div>
            </div>
            <div class="hud-box">
                <div class="hud-title">TEMPERATURE</div>
                <div style="font-size:16px; font-weight:700; color:#22D3EE;">98.6°F</div>
            </div>
        </div>

        <div style="position:absolute; right:10px; top:40%; display:${isHome ? 'none' : 'flex'}; z-index:10; pointer-events:none;">
            <div class="hud-box">
                <div class="hud-title">MUSCLE ACTIVITY</div>
                <div style="display:flex; gap:2px; align-items:flex-end; height:20px;">
                    <div style="width:4px; height:10px; background:#22D3EE;"></div>
                    <div style="width:4px; height:18px; background:#22D3EE;"></div>
                    <div style="width:4px; height:12px; background:#22D3EE;"></div>
                    <div style="width:4px; height:20px; background:#22D3EE;"></div>
                    <div style="width:4px; height:8px; background:#22D3EE;"></div>
                    <div style="width:4px; height:15px; background:#22D3EE;"></div>
                </div>
            </div>
        </div>

        <!-- 360° view controls -->
        <div class="bm-ctl" style="display:${isHome ? 'none' : 'flex'}">
            <button class="bm-btn" onclick="bmView(0)">Front</button>
            <button class="bm-btn" onclick="bmView(1.5708)">Right</button>
            <button class="bm-btn" onclick="bmView(3.1416)">Back</button>
            <button class="bm-btn" onclick="bmView(4.7124)">Left</button>
            <button id="bm-auto" class="bm-btn ${BM.auto ? 'on' : ''}" onclick="bmAuto()">⟳ Auto</button>
        </div>
    </div>

    <style>
        .hud-box {
            background: rgba(3, 7, 18, 0.6);
            border: 1px solid rgba(34, 211, 238, 0.4);
            border-radius: 6px;
            padding: 6px 10px;
            min-width: 80px;
            box-shadow: 0 0 15px rgba(34, 211, 238, 0.15);
            backdrop-filter: blur(8px);
        }
        .hud-title {
            color: #22D3EE;
            font-size: 9px;
            letter-spacing: 1px;
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .bm-ctl { position:absolute; left:50%; bottom:8px; transform:translateX(-50%); gap:6px; z-index:11; }
        .bm-btn {
            background: rgba(3,7,18,0.65); border: 1px solid rgba(190,240,255,0.5); color: #e6faff;
            border-radius: 99px; padding: 5px 12px; font-size: 12px; cursor: pointer; backdrop-filter: blur(8px);
        }
        .bm-btn.on { background: rgba(34,211,238,0.35); }
    </style>`;
}

const SC={};
const sideHTML=m=>`<div class="card side"><div class="row" style="justify-content:space-between"><b style="font-size:20px">${m.name}</b>${stChip(m.level)}</div><p style="margin:8px 0;color:var(--mut)">Affected by: ${m.hazards.join(', ')}</p><h3>${m.label}</h3><div class="val">${m.value} <small>${m.unit}</small></div>${chart(m.series,COL[m.level],60)}<p style="margin:10px 0; font-size: 14px;">${m.text}</p><div class="row" style="margin-top: 14px;"><button class="btn" onclick="ask('Tell me about my ${m.name}')">Ask ASTRA</button><button class="btn o" onclick="toast('Medical review requested (demo)')">Escalate review</button></div></div>`;

SC.home=()=>{
    const n=S.attention,al=Object.entries(S.modules).filter(([k,m])=>m.chip=='alert').map(([k])=>k);
    return `${S.rad.spe?`<div class="card warn" style="margin-bottom:16px">⚠ <b>Space weather alert.</b> ${S.rad.spe_text}</div>`:''}
    <div class="hero"><div class="orbw"><div class="orb ${speaking?'sp':''}" id="orb"></div></div>
    <h1>Good morning. ${n?'Some items need attention.':'Your overall status is stable.'}</h1>
    <p style="color:var(--mut);margin:0;max-width:560px">Tracks an astronaut's health on a long Mars mission and warns early when something changes.</p>
    <div class="row"><span class="badge">Health score ${S.checkin.score}/100</span><span class="badge d">🔥 ${S.checkin.streak}-day streak</span></div>
    <p style="color:var(--mut);margin:0">${n?`${n} item${n>1?'s':''} require${n>1?'':'s'} attention.`:'All monitored parameters nominal.'} ${al.length?'Critical flags: '+al.join(', ')+'.':''}</p>
    <div class="chips" style="justify-content:center">${CMDS.map(c=>`<button class="cmd" onclick="ask('${c}')">“${c}”</button>`).join('')}</div></div>
    <div class="card chat" id="home-chat">${LOG.map(b=>`<div class="bub ${b.n?'':'u'}">${b.t}</div>`).join('')||'<div class="bub">Greetings Commander Amara. ASTRA is ready. Type a message below to begin.</div>'}</div>
    ${nba()}
    <div class="grid2">
        <div class="card" style="display:flex; justify-content:center; align-items:center; padding:0; overflow:hidden;">${getBodySVG(S.markers, null, 'all', true)}</div>
        <div style="align-self:center">${remCard()}</div>
    </div>
    <div class="mods">${Object.entries(S.modules).map(([k,m])=>`<div class="card mod" style="border-top:2px solid ${CH[m.chip][2]}" onclick="go('${k}')"><span style="font-size:24px">${NAV.find(n=>n[0]==k)?.[1]||''}</span><b style="font-size: 15px;">${k[0].toUpperCase()+k.slice(1)}</b>${modChip(m.chip)}</div>`).join('')}</div>
    <div class="chips"><span style="color:var(--mut);font-size:13px">Demo:</span><button class="f" onclick="demo(20)">Normal day</button><button class="f" onclick="demo(142)">Solar storm</button><button class="f" onclick="demo(60,{hr:118,sleep:5,mood:4})">Health warning</button></div>
    <p class="hint" style="text-align:center">Prototype with simulated data. Health ranges are placeholders until reviewed by NASA HRP or a flight surgeon.</p>`
};

SC.body=()=>{
    const m = S.markers.find(x=>x.id==sel);
    return `
    <div class="chips" style="margin-top:0">${HZ.map(h=>`<button class="f ${flt==h?'on':''}" onclick="flt='${h}';go('body',1)">${h[0].toUpperCase()+h.slice(1)}</button>`).join('')}</div>
    <div class="card tr" style="display:flex; justify-content:center; align-items:center; position:relative; padding:0; min-height: 560px; overflow:hidden;">
        ${getBodySVG(S.markers, sel, flt, false)}
        ${m ? sideHTML(m) : '<div class="hint" style="position:absolute;top:20px;left:50%;transform:translateX(-50%);pointer-events:none;font-size:14px; background:rgba(3,7,18,0.8); padding:8px 16px; border-radius:99px; border:1px solid var(--glass-border); z-index:10;">Drag to rotate 360° • Tap a glowing dot to see details</div>'}
        <div style="position:absolute;left:20px;bottom:16px;color:var(--mut);font-size:13px; font-weight: 500; background: rgba(3,7,18,0.8); padding: 6px 14px; border-radius: 99px; border: 1px solid var(--glass-border); backdrop-filter: blur(8px); z-index:10;">${['normal','watch','warning','critical'].map(l=>`<span style="color:${COL[l]}">${IC[l]} ${LB[l]}</span>`).join(' &nbsp;·&nbsp; ')}</div>
    </div>
    <div class="card" style="margin-top:16px"><div class="row" style="justify-content:space-between"><b>Mission day ${day} of ${S.total}</b><span id="cap" style="color:var(--cy); font-weight: 500;">“${LOG.filter(x=>x.n).slice(-1)[0]?.t||'Tap a marker or ask ASTRA about your body.'}”</span></div><input type="range" min="1" max="${S.total}" value="${day}" oninput="loadDay(+this.value)"></div>`;
};

function mod(k){
    const M=S.modules[k],R=S.rad;let x='';
    if(k=='radiation'){const p=Math.min(1,M.metrics[0].value/R.limit);x=(R.spe?`<div class="card warn">⚠ <b>Space weather alert.</b> ${R.spe_text}</div>`:'')+`<div class="card row" style="align-items: center; justify-content: space-around;"><svg viewBox="0 0 200 115" width="220"><path d="M10 100A90 90 0 0 1 190 100" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="16" stroke-linecap="round"/><path d="M10 100A90 90 0 0 1 190 100" fill="none" stroke="${p>.75?COL.warning:p>.5?COL.watch:COL.normal}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${p*283} 283" style="filter:drop-shadow(0 0 8px currentColor)"/><text x="100" y="86" text-anchor="middle" fill="#fff" font-size="28" font-weight="700">${Math.round(p*100)}%</text><text x="100" y="108" text-anchor="middle" fill="#94A3B8" font-size="11" font-weight="500">${M.metrics[0].value} of ${R.limit} mSv</text></svg><div><h3>Mars Transit vs Surface</h3>Transit: <b style="color:var(--tx);">${M.metrics[1].value} mSv/d</b><br>Surface: <b style="color:var(--tx);">${M.metrics[2].value} mSv/d</b></div></div>`}
    if(k=='gravity')x=`<div class="card"><h3>Exercise adherence (last 7 days)</h3><div class="dots" style="margin: 12px 0;">${S.adherence.map(a=>`<i style="background:${a?COL.normal:COL.warning};color:#030712">${a?'✓':'✕'}</i>`).join('')}</div><p style="font-weight: 500;">${S.adherence.filter(a=>a).length} of 7 mandatory sessions completed</p></div>`;
    if(k=='immune'){const v=M.metrics[3].value;x=`<div class="card"><h3>Infection risk index</h3><div class="bar"><b style="width:${v*2}%;background:${COL[M.metrics[3].level]}"></b></div><div class="row" style="justify-content: space-between; margin-top: 8px;"><span style="font-weight:700; font-size:18px;">${v}%</span>${stChip(M.metrics[3].level)}</div></div>`}
    if(k=='mind')x=`<div class="card"><h3>Calming protocols</h3><div class="row"><button class="cmd" onclick="ask('Breathing exercise')">🫁 Breathing</button><button class="cmd" onclick="ask('Play music')">♫ Spatial Audio</button><button class="cmd" onclick="go('companion')">☎ Comms Link</button></div></div>`;
    const cut=`<svg viewBox="0 0 320 200" width="100%"><rect x="10" y="40" width="300" height="120" rx="60" fill="rgba(3,7,18,0.7)" stroke="rgba(34,211,238,0.3)" stroke-width="2"/>${[['Crew',50,'normal'],['Lab',130,'watch'],['Sleep pods',210,'watch'],['Greenhouse',275,'normal']].map(([n,cx,l])=>`<rect x="${cx-35}" y="70" width="70" height="60" rx="12" fill="${COL[l]}15" stroke="${COL[l]}"/><text x="${cx}" y="105" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">${n}</text><text x="${cx}" y="124" text-anchor="middle" fill="${COL[l]}" font-size="11">${IC[l]}</text>`).join('')}</svg>`;
    return `<div class="row" style="justify-content:space-between"><div class="row"><h2>${M.title}</h2>${modChip(M.chip)}</div><button class="btn" onclick="ask('${M.ask}')">🎙 ${M.askLabel}</button></div>
    <div class="mgrid"><div class="col">${x}<div class="metrics">${M.metrics.map(met).join('')}</div>${k=='habitat'?`<div class="card"><h3>Anomaly alerts</h3>${M.anomalies.map(a=>`<p style="margin:4px 0;">▲ ${a}</p>`).join('')||'None detected'}</div>`:''}</div>
    <div class="col"><div class="card" style="padding:20px; display:flex; justify-content:center; align-items:center; background: rgba(3,7,18,0.5);">${k=='habitat'?'<h3>Habitat schematic</h3>'+cut:'<div style="color:var(--cy); font-size:48px;">☢</div>'}</div><div class="card ins"><h3>AI diagnostic insight</h3><p style="margin:0; font-size:14px; line-height: 1.5;">${M.insight}</p></div></div></div>`
}
['radiation','gravity','immune','mind','habitat'].forEach(k=>SC[k]=()=>mod(k));

SC.companion=()=>`<div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div class="orb sm ${speaking?'sp':''}" id="orb"></div><div class="card chat" id="chat" style="flex:1">${LOG.map(b=>`<div class="bub ${b.n?'':'u'}">${b.t}</div>`).join('')||'<div class="bub">Greetings Commander Amara. ASTRA secure channel active. How are you feeling today?</div>'}</div></div>
<div class="chips" style="margin-top: 16px;">${['Explain my status','I feel lonely','Play music','Breathing exercise','Tell me a story','Messages from home','Play a game'].map(c=>`<button class="cmd" onclick="ask('${c}')">${c}</button>`).join('')}</div>
<div class="card" style="margin-top: 16px;"><h3>Messages from home</h3>${S.messages.map(m=>`<p style="margin:6px 0">${m}</p>`).join('')}</div>
<div class="card ins" style="margin-top: 16px;"><b>External Communication Link</b><div class="row" style="margin-top:10px"><button class="btn" onclick="toast('Calling Earth Mission Control… 12 min light-speed delay (demo)')">Direct to Earth</button><button class="btn o" onclick="toast('Pinging habitat crewmate (demo)')">Inter-module Comms</button></div></div>`;

SC.research=()=>{const m=S.markers.find(x=>x.id==rsel),E={Strong:'●●●',Moderate:'●●○',Emerging:'●○○'};
return `<h2>Countermeasure research repository</h2><div class="chips">${S.markers.map(x=>`<button class="f ${rsel==x.id?'on':''}" onclick="rsel='${x.id}';go('research',1)">${x.name}</button>`).join('')}</div>
<div class="card warn" style="margin-bottom:14px">Informational research database only. Not a medical prescription.</div>
<div class="metrics">${m.hazards.flatMap(h=>S.counter[h].map(c=>({h,c}))).map(({h,c})=>`<div class="card"><h3>${h}</h3><b style="font-size:18px; color:var(--tx);">${c[0]}</b><p style="margin:8px 0 4px;"><span class="ev">${E[c[1]]} ${c[1]} evidence</span></p><p style="color:var(--mut); margin:0;">Safety profile: ${c[2]}</p></div>`).join('')}</div>`};

const remCard=()=>{const C=S.checkin;return `<div class="card ${C.due.length?'warn':''}"><div class="row" style="justify-content:space-between"><div><b style="font-size: 16px;">Daily check-in: ${C.items.length-C.due.length} of ${C.items.length} logged</b><div style="color:var(--mut); margin-top:2px;">${C.due.length?'Pending metrics: '+C.due.join(', '):'All metrics logged successfully. Streak: '+C.streak+' days.'}</div></div><button class="btn" onclick="go('checkin')">Open Check-in</button></div></div>`},
nba=()=>{const w=S.checkin.items.reduce((a,b)=>ORDER(b.level)>ORDER(a.level)?b:a),ok=w.level=='normal';return `<div class="card ${ok?'ins':'warn'}" style="margin-bottom:16px"><h3>Next best action</h3><b>${ok?'All check-in values are normal.':w.label+' is '+w.level+'.'}</b><p style="margin:4px 0 0">${w.action}</p>${w.escalate?'<button class="btn o" style="margin-top:10px" onclick="toast(\'Flight surgeon notified (demo)\')">Contact flight surgeon</button>':''}</div>`};

SC.checkin=()=>{const C=S.checkin;
const card=i=>`<div class="card"><div class="row" style="justify-content:space-between"><h3>${i.label}</h3>${stChip(i.level)}</div><div class="val">${i.value} <small>${i.unit}</small></div>${chart(i.series,COL[i.level])}<p style="margin:8px 0 4px"><small style="color:var(--mut)">${i.logged?'Logged today':'Pending today'} · baseline ${i.baseline} (${i.dev>0?'+':''}${i.dev}%)</small></p><p style="margin:4px 0 10px"><b>Protocol:</b> ${i.action}</p><details><summary style="cursor:pointer;color:var(--cy); font-weight: 500;">Methodology &amp; Context</summary><p style="margin-top:6px;"><b>Orbital relevance:</b> ${i.why}</p><p><b>Measurement:</b> ${i.how}</p><p style="color:var(--mut); margin-bottom:0;">Normal parameters: ${i.n[0]}–${i.n[1]} ${i.unit}. ${i.src}</p></details>${i.escalate?'<button class="btn o" style="margin-top:12px;" onclick="toast(\'Flight surgeon notified (demo)\')">Contact flight surgeon</button>':''}</div>`;
return `<div class="row" style="justify-content:space-between"><h2>Daily Physiological Check-in</h2><div class="row"><span class="st" style="color:var(--cy); border-color:rgba(34,211,238,0.3); background:rgba(34,211,238,0.08)">Health Score ${C.score}/100</span><span class="st" style="color:var(--yl); border-color:rgba(250,204,21,0.3); background:rgba(250,204,21,0.08)">🔥 ${C.streak}-Day Streak</span></div></div>
<div class="card warn" style="margin:16px 0">Clinical guidance telemetry only, not an automated medical diagnosis. Demo parameters active.</div>
${C.escalate?'<div class="card warn" style="margin-bottom:16px">▲ <b>Critical marker deviation detected.</b> Immediate flight surgeon consultation recommended.</div>':''}
<div class="card"><div class="row" style="justify-content:space-between"><h3>Input Today's Telemetry</h3><button class="cmd" onclick="dictateCheckin()">🎙 Dictate readings</button></div><p style="color:var(--mut);margin:0">Say, for example: “heart rate 72, blood pressure 120 over 80, sleep 7 hours.” Review the fields, then save.</p><div id="voiceStatus" role="status" style="color:var(--cy);margin-top:8px"></div><div class="metrics" style="margin-top:12px">${C.items.map(i=>`<label>${i.label} (${i.unit})<input id="in_${i.key}" type="number" step="any" placeholder="${i.value}" class="ti" onkeydown="if(event.key=='Enter')submitCheckin()"></label>`).join('')}</div><div class="row" style="margin-top:16px"><button class="btn" onclick="submitCheckin()">Save Telemetry</button><button class="f" onclick="resetCheckin()">Reset Demo State</button></div><div id="cerr" style="color:var(--or);margin-top:8px; font-weight:500;"></div></div>
<div class="metrics" style="margin-top:16px">${C.items.map(card).join('')}</div>`};

async function submitCheckin(){const v={};document.querySelectorAll('.ti').forEach(e=>{if(e.value!=='')v[e.id.slice(3)]=e.value});
if(!Object.keys(v).length)return toast('Please enter at least one metric value');
const j=await (await fetch('/api/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:v})})).json();
S=await (await fetch('/api/state?day='+day)).json();render();
if(j.errors&&j.errors.length){for(const k in v){const e=$('#in_'+k);if(e)e.value=v[k]}$('#cerr').textContent=j.errors.join(' ');return}toast('Telemetry saved successfully');
const w=S.checkin.items.find(i=>i.escalate);if(w)say('Your '+w.label.toLowerCase()+' is '+w.level+'. '+w.action)}

async function parseCheckinVoice(text){const st=$('#voiceStatus');
try{const res=await fetch('/api/checkin/parse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})}),j=await res.json();
if(!res.ok){st.textContent=(j.errors||['Could not parse the readings.']).join(' ');return}
Object.entries(j.values).forEach(([k,v])=>{const i=$('#in_'+k);if(i)i.value=v});$('#cerr').textContent='';
const lb=Object.fromEntries(S.checkin.items.map(i=>[i.key,i.label]));
st.textContent='Readings entered: '+Object.keys(j.values).map(k=>lb[k]||k).join(', ')+'. Review them, then save.'}
catch(e){st.textContent='Could not process voice entry: '+e.message}}

function dictateCheckin(){const st=$('#voiceStatus');
if(!SR){st.textContent='Speech recognition is not supported in this browser. You can enter readings below.';return}
if(rec){rec.stop();return}
let txt='',failed=false;rec=new SR();rec.lang='en-US';rec.interimResults=true;
$('#mic').classList.add('on');$('#wave').classList.add('on');st.textContent='Listening for measurements…';
rec.onresult=e=>{const r=[...e.results],f=r.filter(x=>x.isFinal);st.textContent='Listening… '+r.map(x=>x[0].transcript).join(' ');if(f.length)txt=f.map(x=>x[0].transcript).join(' ')};
rec.onerror=e=>{failed=true;st.textContent='Voice entry failed: '+e.error};
rec.onend=()=>{rec=null;$('#mic').classList.remove('on');if(!speaking)$('#wave').classList.remove('on');
if(!failed&&txt.trim())parseCheckinVoice(txt.trim());else if(!failed)st.textContent='No speech detected. Try again or enter readings below.'};
try{rec.start()}catch(e){rec=null;$('#mic').classList.remove('on');$('#wave').classList.remove('on');st.textContent='Could not start voice entry: '+e.message}}

async function resetCheckin(){await fetch('/api/checkin/reset',{method:'POST'});S=await (await fetch('/api/state?day='+day)).json();render();toast('Demo state reset')}

async function demo(d,vals){await fetch('/api/checkin/reset',{method:'POST'});
if(vals)await fetch('/api/checkin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:vals})});
day=d;S=await (await fetch('/api/state?day='+d)).json();go('home');
const w=S.checkin.items.find(i=>i.escalate);if(S.rad.spe)say(S.rad.spe_text);else if(w)say('Your '+w.label.toLowerCase()+' is '+w.level+'. '+w.action)}

function go(s,keep){screen=s;if(phone())$('#app').classList.add('collapsed');render();if(!keep)$('#main').animate([{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:400,easing:'ease-out'})}

function render(){$('#who').textContent=S.astronaut;$('#dn').textContent='Mission day '+day+' / '+S.total;$('#rail').innerHTML=NAV.map(([k,i,l])=>{const c=S.modules[k]?.chip,x=c&&c!='stable'?CH[c][2]:'';return `<button class="${screen==k?'on':''}" onclick="go('${k}')"><i>${i}</i>${l}${x?`<b class="dot" style="background:${x};box-shadow:0 0 8px ${x}"></b>`:''}</button>`}).join('');
$('#main').innerHTML=SC[screen]();const c=$('#chat');if(c)c.scrollTop=1e9}

async function loadDay(d){const old=S;day=d;S=await (await fetch('/api/state?day='+d)).json();$('#dn').textContent='Mission day '+day+' / '+S.total;
const w=S.markers.find((m,i)=>ORDER(m.level)>ORDER(old.markers[i].level));
if(w){const t=`Anomaly alert: your ${w.name.toLowerCase()} is now ${w.level}. ${w.label}: ${w.value} ${w.unit}.`;const b=$('#bn');b.textContent='▲ '+t;b.classList.add('show');setTimeout(()=>{b.classList.remove('show')},5000);say(t)}
if(screen=='body')render();if(screen!='body'&&screen!='home')render()}

function stopVoice(){voiceRequest++;if(voiceController){voiceController.abort();voiceController=null}if(voiceAudio){voiceAudio.pause();voiceAudio=null}if(voiceUrl){URL.revokeObjectURL(voiceUrl);voiceUrl=null}
if('speechSynthesis' in window)speechSynthesis.cancel()}

function finishVoice(requestId,message){if(requestId!==voiceRequest)return;
if(voiceUrl){URL.revokeObjectURL(voiceUrl);voiceUrl=null}voiceAudio=null;voiceController=null;speaking=false;$('#wave').classList.remove('on');
document.querySelectorAll('.orb').forEach(o=>o.classList.remove('sp'));$('#tt').textContent=message||'ASTRA is ready'}

function browserVoices(){if(!('speechSynthesis' in window))return Promise.resolve([]);
const synth=speechSynthesis,voices=synth.getVoices();if(voices.length)return Promise.resolve(voices);
return new Promise(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;clearTimeout(timer);
synth.removeEventListener('voiceschanged',changed);resolve(synth.getVoices())};
const changed=()=>{if(synth.getVoices().length)done()};const timer=setTimeout(done,700);
synth.addEventListener('voiceschanged',changed)})}

async function speakWithApi(requestId,text){if(requestId!==voiceRequest)return;
if('speechSynthesis' in window)speechSynthesis.cancel();
$('#tt').textContent='Using API voice…';voiceController=new AbortController();
try{const response=await fetch('/api/voice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:voiceController.signal});
if(requestId!==voiceRequest)return;
if(!response.ok){let result={};try{result=await response.json()}catch(e){}throw new Error(result.error||'Speech generation failed.')}
voiceUrl=URL.createObjectURL(await response.blob());voiceAudio=new Audio(voiceUrl);
voiceAudio.onended=()=>finishVoice(requestId);voiceAudio.onerror=()=>finishVoice(requestId,'API voice playback failed.');
await voiceAudio.play()}catch(error){if(requestId===voiceRequest&&error.name!=='AbortError')finishVoice(requestId,'API voice failed: '+error.message)}}

async function say(t){LOG.push({n:1,t});const tt=$('#tt');const c=$('#cap');if(c)c.textContent='“'+t+'”';
stopVoice();const requestId=voiceRequest;speaking=true;tt.textContent='ASTRA transmitting… '+t;$('#wave').classList.add('on');
document.querySelectorAll('.orb').forEach(o=>o.classList.add('sp'));
const ch=$('#chat')||$('#home-chat');if(ch){ch.insertAdjacentHTML('beforeend',`<div class="bub">${t}</div>`);ch.scrollTop=1e9}
if(muted){finishVoice(requestId);return}
const voices=await browserVoices();if(requestId!==voiceRequest)return;
if(voices.length&&'speechSynthesis' in window){try{const utterance=new SpeechSynthesisUtterance(t);utterance.onend=()=>finishVoice(requestId);
utterance.onerror=()=>speakWithApi(requestId,t);speechSynthesis.cancel();speechSynthesis.speak(utterance)}
catch(error){speakWithApi(requestId,t)}}
else speakWithApi(requestId,t)}

async function ask(text){text=text.replace(/^hey astra[, ]*/i,'');LOG.push({n:0,t:text});const ch=$('#chat')||$('#home-chat');if(ch){ch.insertAdjacentHTML('beforeend',`<div class="bub u">${text}</div>`);ch.scrollTop=1e9}
const r=await (await fetch('/api/astra',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,day})})).json();
S=await (await fetch('/api/state?day='+day)).json();if(r.select)sel=r.select;if(r.nav&&r.nav!=screen)go(r.nav);else if(r.select)go('body',1);else if(r.nav=='checkin')render();say(r.reply)}

$('#ti').onkeydown=e=>{
  if(e.key=='Enter'&&e.target.value.trim()){
    ask(e.target.value.trim());
    e.target.value='';
    const chat=$('#chat')||$('#home-chat');
    if(chat) chat.scrollIntoView({ behavior:'smooth', block:'start' });
  }
};

$('#mute').onclick=()=>{muted=!muted;$('#mute').innerHTML=muted?'🔇<span class="lb"> Voice off</span>':'🔊<span class="lb"> Voice on</span>';if(muted){stopVoice();finishVoice(voiceRequest)}};
$('#wave').innerHTML='<i></i>'.repeat(26);document.querySelectorAll('#wave i').forEach((e,i)=>e.style.animationDelay=(i*.05)+'s');
$('#mic').onclick=()=>{if(!SR)return toast('Speech recognition unsupported. Type message instead.');if(rec){rec.stop();return}
rec=new SR();rec.lang='en-US';rec.interimResults=true;$('#mic').classList.add('on');$('#wave').classList.add('on');$('#tt').textContent='Listening…';
rec.onresult=e=>{const t=[...e.results].map(r=>r[0].transcript).join('');$('#tt').textContent='Listening… '+t;if(e.results[0].isFinal)ask(t)};
rec.onend=()=>{rec=null;$('#mic').classList.remove('on');if(!speaking)$('#wave').classList.remove('on')};rec.start()};
$('#hamburger').onclick=()=>{$('#app').classList.toggle('collapsed');dispatchEvent(new Event('resize'))};
$('#app').classList.toggle('collapsed',wasPhone);addEventListener('resize',()=>{if(phone()!=wasPhone){wasPhone=phone();$('#app').classList.toggle('collapsed',wasPhone)}});

fetch('/api/state?day='+day).then(r=>r.json()).then(s=>{S=s;render()},()=>{$('#main').innerHTML='<div class="hero"><h2>Can’t reach ASTRABIO</h2><p style="color:var(--mut);margin:0">The server is not answering. Check that it is running, then try again.</p><button class="btn" onclick="location.reload()">Try again</button></div>'});
addEventListener('unhandledrejection',()=>toast('Something went wrong. Please try again.'));

$('#enter').onclick=()=>{
  $('#intro').classList.add('out');
};

/* Add Presentation and Demo Video links */
(function addShowcaseLinks(){
  const enterButton = $('#enter');
  if (!enterButton || enterButton.dataset.showcaseLinksAdded === 'true') return;

  const buttonRow = document.createElement('div');
  buttonRow.className = 'showcase-links';

  const makeLink = (label, href) => {
    const link = document.createElement('a');
    link.className = 'showcase-link';
    link.textContent = label;
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  };

  const presentation = makeLink(
    'Presentation',
    'https://1drv.ms/p/c/a6c0d2e6c831bb83/IQBtSM9t_3DfTpnH2lMW1pJgAeFTd04WLuSDhxvIAMatSzk'
  );

  const demoVideo = makeLink(
    'Demo Video',
    'https://drive.google.com/file/d/1_HOzhH-_YD4_62iPf_KarcGIiEVQm85Z/view?usp=sharing'
  );

  const parent = enterButton.parentNode;
  parent.insertBefore(buttonRow, enterButton);
  buttonRow.append(presentation, enterButton, demoVideo);

  enterButton.dataset.showcaseLinksAdded = 'true';
})();

/* start the 3D body animation loop */
if(!BM.raf)BM.raf=requestAnimationFrame(bmFrame);