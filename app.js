(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const qs = (s, el=document) => el.querySelector(s);
  const qsa = (s, el=document) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
  const roomKey = () => new Uint8Array(18).reduce((s, x) => s + x.toString(16).padStart(2,'0'), '');
  const today = () => new Date().toISOString().slice(0,10);
  const fmtDate = d => new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric'}).format(new Date(d+'T00:00:00'));
  const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const DEFAULT_DISHES = [
    ['番茄炒蛋','🍅','家常菜'],['可乐鸡翅','🍗','荤菜'],['青椒肉丝','🥩','荤菜'],['蒜蓉西兰花','🥦','素菜'],
    ['清炒时蔬','🥬','素菜'],['凉拌黄瓜','🥒','凉菜'],['紫菜蛋花汤','🍲','汤羹'],['玉米排骨汤','🍲','汤羹'],
    ['米饭','🍚','主食'],['番茄鸡蛋面','🍜','主食'],['酸奶水果杯','🍓','甜品'],['绿豆汤','🥣','甜品'],['鲜榨橙汁','🍊','饮品'],['柠檬水','🍋','饮品']
  ];
  const CATS = ['全部','家常菜','荤菜','素菜','凉菜','汤羹','主食','甜品','饮品'];
  const MEALS = [['breakfast','早餐'],['lunch','午餐'],['dinner','晚餐'],['snack','加餐']];

  let db = null;
  let state = {
    token: new URLSearchParams(location.search).get('room') || localStorage.getItem('couple_room_token') || '',
    memberId: '', data: null, updatedAt: null, view: 'home', weightWindow: 30,
    dishFilter: '全部', currentMeal: 'dinner', editingDishId: null, saving: false
  };

  function isConfigured(){
    return CFG.supabaseUrl && CFG.supabaseAnonKey && !String(CFG.supabaseUrl).includes('你的项目ID') && !String(CFG.supabaseAnonKey).includes('你的-anon');
  }
  function showToast(msg){ toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>toastEl.classList.remove('show'),2200); }
  function localMembers(){
    try { return JSON.parse(localStorage.getItem('couple_members') || '{}'); } catch { return {}; }
  }
  function setLocalMember(token,id){ const m=localMembers(); m[token]=id; localStorage.setItem('couple_members',JSON.stringify(m)); }
  function getLocalMember(token){ return localMembers()[token] || ''; }

  function blankData(member){
    const dishes = DEFAULT_DISHES.map(([name,emoji,category])=>({id:uid(),name,emoji,category}));
    const menus = {[today()]:{breakfast:[],lunch:[],dinner:[],snack:[]}};
    return {version:1,couple:{members:[member]},weights:[],dishes,menus};
  }
  function normalize(data){
    data = data && typeof data==='object' ? data : {};
    data.version=1;
    data.couple=data.couple||{}; data.couple.members=Array.isArray(data.couple.members)?data.couple.members:[];
    data.weights=Array.isArray(data.weights)?data.weights:[]; data.dishes=Array.isArray(data.dishes)?data.dishes:[];
    data.menus=data.menus&&typeof data.menus==='object'?data.menus:{};
    if(!data.menus[today()]) data.menus[today()]={breakfast:[],lunch:[],dinner:[],snack:[]};
    for(const [k] of MEALS) if(!Array.isArray(data.menus[today()][k])) data.menus[today()][k]=[];
    return data;
  }

  async function rpc(name,args){
    const {data,error}=await db.rpc(name,args);
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || '操作失败');
    return data;
  }
  async function createRoom(){
    const name = qs('#createName').value.trim() || '我';
    const member={id:uid(),name,avatar:'',createdAt:new Date().toISOString()};
    const token=roomKey(); const payload=blankData(member);
    await rpc('create_couple_room',{p_token:token,p_data:payload});
    state.token=token; state.memberId=member.id; setLocalMember(token,member.id); localStorage.setItem('couple_room_token',token);
    history.replaceState({},'',`?room=${token}`); state.data=normalize(payload); render(); showToast('房间创建成功');
  }
  async function joinRoom(){
    const token=qs('#joinToken').value.trim() || state.token;
    const name=qs('#joinName').value.trim() || '我';
    if(!token) throw new Error('请填写房间链接或房间密钥');
    const res=await rpc('get_couple_room',{p_token:token});
    const data=normalize(res.data); state.updatedAt=res.updated_at; state.data=data;
    let id=getLocalMember(token);
    if(!id){
      if(data.couple.members.length>=2) throw new Error('这个房间已经有两个人了');
      const member={id:uid(),name,avatar:'',createdAt:new Date().toISOString()};
      data.couple.members.push(member); id=member.id;
      await saveData(false,token,data);
    } else if(!data.couple.members.some(m=>m.id===id)) {
      if(data.couple.members.length>=2) throw new Error('这个房间已经有两个人了');
      data.couple.members.push({id,name,avatar:'',createdAt:new Date().toISOString()});
      await saveData(false,token,data);
    }
    state.token=token; state.memberId=id; setLocalMember(token,id); localStorage.setItem('couple_room_token',token);
    history.replaceState({},'',`?room=${token}`); render(); showToast('已经加入房间');
  }
  async function loadRoom(silent=false){
    if(!state.token) return;
    try{
      const res=await rpc('get_couple_room',{p_token:state.token});
      const incoming=normalize(res.data);
      if(state.updatedAt !== res.updated_at || !state.data){ state.data=incoming; state.updatedAt=res.updated_at; }
      const me=state.data.couple.members.find(m=>m.id===state.memberId);
      if(!me){ state.memberId=getLocalMember(state.token) || ''; }
      render();
    }catch(e){ if(!silent) renderError(e.message); }
  }
  async function saveData(show=true, token=state.token, data=state.data){
    state.saving=true; renderSaving();
    try{
      const res=await rpc('save_couple_room',{p_token:token,p_data:normalize(data)});
      if(token===state.token){ state.data=normalize(res.data); state.updatedAt=res.updated_at; }
      if(show) showToast('已同步 ❤️');
    }catch(e){ showToast(e.message); }
    finally{state.saving=false;render();}
  }
  function renderSaving(){ const x=qs('.progress'); if(x) x.querySelector('i').style.width='60%'; }

  function render(){
    if(!isConfigured()){ renderSetup(); return; }
    if(!state.token || !state.data){ renderOnboarding(); return; }
    if(!state.memberId){ renderOnboarding(); return; }
    const me=state.data.couple.members.find(m=>m.id===state.memberId);
    if(!me){ renderOnboarding(); return; }
    app.innerHTML = `<div class="app-shell">
      <div class="topbar"><div class="brand">情侣小窝<small>${esc(me.name)} 的健康小天地</small></div><div class="avatar-row">${renderAvatars()}</div></div>
      <main class="content">${state.view==='home'?renderHome():state.view==='menu'?renderMenu():state.view==='dishes'?renderDishes():renderMine()}</main>
      ${renderNav()}
    </div>`;
    bindCommon();
  }
  function renderSetup(){
    app.innerHTML=`<div class="onboard"><div class="box">
      <div class="logo">💗</div><h1>情侣小窝</h1><p>先连接云端，再开始使用。<br>你只需要做一次设置。</p>
      <div class="card" style="box-shadow:none;background:#fff8fa"><strong>还差一步</strong><div class="muted mt8">请打开项目里的 <b>config.js</b>，填入 Supabase 的两项信息，然后重新打开网页。</div></div>
      <p class="small">需要先完成部署教程中的“第 2 步”。</p>
    </div></div>`;
  }
  function renderOnboarding(){
    const hasToken=!!state.token;
    app.innerHTML=`<div class="onboard"><div class="box">
      <div class="logo">💗</div><h1>情侣小窝</h1><p>一起记体重、一起点今天吃什么。<br>一个链接，就能加入同一个小窝。</p>
      <div class="switcher"><button class="active" data-mode="create">创建房间</button><button data-mode="join">加入房间</button></div>
      <div id="onboardCreate"><label class="muted">你的昵称</label><input id="createName" class="input mt8" placeholder="例如：小朱" maxlength="12"><button id="createBtn" class="btn primary full mt12">创建我的情侣小窝</button></div>
      <div id="onboardJoin" style="display:none"><label class="muted">你的昵称</label><input id="joinName" class="input mt8" placeholder="例如：小林" maxlength="12"><label class="muted" style="display:block;margin-top:12px">房间链接或密钥</label><input id="joinToken" class="input mt8" value="${esc(hasToken?state.token:'')}" placeholder="粘贴伴侣发来的链接"><button id="joinBtn" class="btn primary full mt12">加入情侣小窝</button></div>
      ${hasToken?'<div class="muted small mt16">检测到一个房间链接，你也可以直接选择“加入房间”。</div>':''}
    </div></div>`;
    qs('[data-mode="create"]').onclick=()=>switchOnboard('create'); qs('[data-mode="join"]').onclick=()=>switchOnboard('join');
    qs('#createBtn').onclick=async()=>{try{await createRoom()}catch(e){showToast(e.message)}};
    qs('#joinBtn').onclick=async()=>{try{await joinRoom()}catch(e){showToast(e.message)}};
    if(hasToken) switchOnboard('join');
  }
  function switchOnboard(mode){
    qsa('.switcher button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
    qs('#onboardCreate').style.display=mode==='create'?'block':'none'; qs('#onboardJoin').style.display=mode==='join'?'block':'none';
  }
  function renderError(msg){ app.innerHTML=`<div class="onboard"><div class="box"><div class="logo">🥺</div><h1>房间打不开</h1><p>${esc(msg)}</p><button class="btn primary full" onclick="location.href=location.pathname">重新开始</button></div></div>`; }
  function renderAvatars(){ return state.data.couple.members.map((m,i)=>`<img class="avatar ${i?'second':''}" src="${esc(m.avatar||'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='32' fill='#ffe3ea'/><text x='32' y='42' text-anchor='middle' font-size='30'>${(m.name||'❤').slice(0,1)}</text></svg>`))}" alt="头像">`).join('') + '<span class="status-dot"></span>'; }
  function renderNav(){ return `<nav class="bottom-nav">${[['home','⚖️','体重'],['menu','🍱','菜单'],['dishes','🥗','菜品库'],['mine','💗','我的']].map(([v,i,t])=>`<button class="nav-btn ${state.view===v?'active':''}" data-view="${v}"><span class="ico">${i}</span>${t}</button>`).join('')}</nav>`; }

  function statsFor(memberId){
    const arr=state.data.weights.filter(x=>x.memberId===memberId).sort((a,b)=>a.date.localeCompare(b.date));
    if(!arr.length) return {latest:null,prev:null,first:null,delta:null,total:null,arr};
    const latest=arr[arr.length-1], prev=arr.length>1?arr[arr.length-2]:null, first=arr[0];
    return {latest,prev,first,delta:prev?latest.value-prev.value:null,total:latest.value-first.value,arr};
  }
  function renderHome(){
    const members=state.data.couple.members; const daily=members.map(m=>({m,s:statsFor(m.id)}));
    return `<section class="hero card"><div class="between"><div><h2>今天也一起坚持吧 💗</h2><p>${fmtDate(today())} · 数据会自动同步</p></div><div class="small muted">${state.saving?'同步中…':'已连接'}</div></div></section>
      <div class="section-title"><h3>今日体重</h3><span>最近一次记录</span></div>
      <div class="weight-head">${daily.map(({m,s})=>`<div class="person-card"><div class="between"><span class="person-name">${esc(m.name)}</span><button class="btn icon" data-action="add-weight" data-member="${m.id}">＋</button></div>${s.latest?`<div class="weight-number">${s.latest.value.toFixed(1)}<span style="font-size:13px;font-weight:500"> kg</span></div><div class="small muted">${esc(s.latest.date)} ${s.delta==null?'':`· 上次 <span class="delta ${s.delta>0?'up':'down'}">${s.delta>0?'+':''}${s.delta.toFixed(1)} kg</span>`}</div>`:'<div class="empty">还没有记录</div>'}</div>`).join('')}</div>
      <div class="section-title"><h3>体重趋势</h3><div class="tabs">${[7,30,0].map(v=>`<button class="chip ${state.weightWindow===v?'active':''}" data-window="${v}">${v?`${v}天`:'全部'}</button>`).join('')}</div></div>
      <div class="card" style="padding:10px"><div class="canvas-wrap"><canvas id="weightChart"></canvas></div><div class="small muted" style="padding:0 5px 4px">纵轴单位：kg</div></div>
      <div class="grid2">${daily.map(({m,s})=>`<div class="stat"><div class="label">${esc(m.name)} 累计变化</div><strong>${s.total==null?'—':(s.total>0?'+':'')+s.total.toFixed(1)+' kg'}</strong><small>${s.first?`${fmtDate(s.first.date)} 起`:'等待第一条记录'}</small></div>`).join('')}</div>`;
  }
  function drawChart(){
    const canvas=qs('#weightChart'); if(!canvas)return; const rect=canvas.getBoundingClientRect(), dpr=devicePixelRatio||1; canvas.width=rect.width*dpr; canvas.height=rect.height*dpr; const c=canvas.getContext('2d'); c.scale(dpr,dpr);
    const W=rect.width,H=rect.height,pad={l:36,r:12,t:18,b:28}; c.clearRect(0,0,W,H);
    const end=new Date(); let start=new Date(); if(state.weightWindow>0) start.setDate(end.getDate()-state.weightWindow+1); else { const all=state.data.weights.map(x=>x.date).sort(); if(all.length) start=new Date(all[0]+'T00:00:00'); }
    const members=state.data.couple.members; const series=members.map(m=>state.data.weights.filter(x=>x.memberId===m.id && new Date(x.date+'T23:59:59')>=start && new Date(x.date+'T00:00:00')<=end).sort((a,b)=>a.date.localeCompare(b.date)));
    const vals=series.flat().map(x=>x.value); if(!vals.length){c.fillStyle='#a99ca1';c.font='14px sans-serif';c.textAlign='center';c.fillText('记录体重后，这里会出现趋势曲线',W/2,H/2);return;}
    let min=Math.floor(Math.min(...vals)-1), max=Math.ceil(Math.max(...vals)+1); if(max-min<3){const mid=(max+min)/2;min=mid-1.5;max=mid+1.5;}
    c.strokeStyle='#eee3e7';c.lineWidth=1; c.font='10px sans-serif';c.fillStyle='#aa9ca2';c.textAlign='right'; for(let i=0;i<4;i++){const y=pad.t+i*(H-pad.t-pad.b)/3;c.beginPath();c.moveTo(pad.l,y);c.lineTo(W-pad.r,y);c.stroke();c.fillText((max-(max-min)*i/3).toFixed(1),pad.l-7,y+3);}
    const xFor=d=>pad.l+(new Date(d+'T00:00:00')-start)/Math.max(1,end-start)*(W-pad.l-pad.r); const yFor=v=>pad.t+(max-v)/(max-min)*(H-pad.t-pad.b);
    series.forEach((arr,idx)=>{if(!arr.length)return;c.strokeStyle=idx===0?'#f37f9d':'#8db8f3';c.lineWidth=3;c.lineJoin='round';c.lineCap='round';c.beginPath();arr.forEach((p,i)=>{const x=xFor(p.date),y=yFor(p.value);i?c.lineTo(x,y):c.moveTo(x,y)});c.stroke();arr.forEach(p=>{const x=xFor(p.date),y=yFor(p.value);c.beginPath();c.fillStyle=idx===0?'#f37f9d':'#8db8f3';c.arc(x,y,3.5,0,Math.PI*2);c.fill()});});
  }

  function menuForDate(d=today()){ if(!state.data.menus[d]) state.data.menus[d]={breakfast:[],lunch:[],dinner:[],snack:[]}; return state.data.menus[d]; }
  function dishById(id){return state.data.dishes.find(d=>d.id===id)}
  function renderMenu(){
    const menu=menuForDate(), dishes=state.data.dishes;
    return `<div class="section-title"><h3>今天吃什么</h3><span>${fmtDate(today())}</span></div>
      <div class="tabs" style="margin-bottom:12px">${MEALS.map(([k,t])=>`<button class="meal-tab ${state.currentMeal===k?'active':''}" data-meal="${k}">${t} ${menu[k].length?`· ${menu[k].length}`:''}</button>`).join('')}</div>
      ${MEALS.map(([k,t])=>`<div class="card menu-meal" ${state.currentMeal!==k?'style="display:none"':''}><div class="between"><h4>${t}</h4><div class="row"><button class="btn icon" data-random="${k}">🎲 随机</button><button class="btn primary icon" data-add-dish="${k}">＋ 加菜</button></div></div>${menu[k].length?menu[k].map(id=>{const d=dishById(id);return d?`<div class="dish-item"><span class="dish-emoji">${esc(d.emoji)}</span><span class="dish-name">${esc(d.name)}<span class="dish-meta"> · ${esc(d.category)}</span></span><button class="btn danger icon" data-remove-menu="${k}" data-id="${id}">删除</button></div>`:''}).join(''):'<div class="empty">还没选菜，点“加菜”或“随机”吧</div>'}</div>`).join('')}
      <div class="card"><div class="between"><div><strong>共同菜单</strong><div class="muted mt8">你们任意一方加入的菜，都会同步到这里。</div></div><button class="btn" data-action="go-dishes">管理菜品</button></div></div>`;
  }
  function renderDishes(){
    const ds=state.data.dishes.filter(d=>state.dishFilter==='全部'||d.category===state.dishFilter);
    return `<div class="section-title"><h3>菜品库</h3><button class="btn primary" data-action="new-dish">＋ 新菜品</button></div>
      <div class="tabs">${CATS.map(c=>`<button class="filter-btn ${state.dishFilter===c?'active':''}" data-category="${c}">${c}</button>`).join('')}</div>
      <div class="card" style="margin-top:12px"><div class="between"><div><strong>当前加到</strong><div class="muted mt8">${MEALS.find(x=>x[0]===state.currentMeal)?.[1]||'晚餐'}</div></div><button class="btn" data-action="switch-meal">切换餐次</button></div></div>
      ${ds.length?`<div class="dish-grid">${ds.map(d=>`<button class="dish-card" data-dish="${d.id}"><div class="emoji">${esc(d.emoji)}</div><strong>${esc(d.name)}</strong><small>${esc(d.category)}</small><div class="small" style="color:var(--pink);margin-top:8px">点一下加入当前餐</div></button>`).join('')}</div>`:'<div class="card empty">暂无菜品</div>'}`;
  }
  function renderMine(){
    const me=state.data.couple.members.find(m=>m.id===state.memberId), partner=state.data.couple.members.find(m=>m.id!==state.memberId);
    const link=location.href.split('?')[0]+'?room='+state.token;
    return `<div class="section-title"><h3>我的</h3></div>
      <div class="card"><div class="between"><div><strong>${esc(me?.name||'我')}</strong><div class="muted mt8">${partner?`伴侣：${esc(partner.name)}`:'等待伴侣加入…'}</div></div><button class="btn" data-action="edit-profile">编辑资料</button></div></div>
      <div class="card"><strong>分享给伴侣</strong><div class="muted mt8">把下面链接发给伴侣，打开后即可加入同一个小窝。</div><input class="input mt12" readonly value="${esc(link)}"><div class="row mt8"><button class="btn primary" data-action="copy-link">复制链接</button><button class="btn" data-action="share-link">系统分享</button></div></div>
      <div class="card"><div class="between"><div><strong>同步状态</strong><div class="muted mt8">每几秒自动检查一次最新数据。</div></div><span class="status-dot"></span></div><div class="progress mt12"><i style="width:${state.saving?'60%':'100%'}"></i></div><div class="small muted mt8">房间编号：${esc(state.token.slice(0,8))}…</div></div>
      <div class="card"><button class="btn danger full" data-action="leave">退出本机登录</button></div>`;
  }

  function bindCommon(){
    qsa('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
    qsa('[data-window]').forEach(b=>b.onclick=()=>{state.weightWindow=Number(b.dataset.window);render();drawChart()});
    qsa('[data-meal]').forEach(b=>b.onclick=()=>{state.currentMeal=b.dataset.meal;render()});
    qsa('[data-category]').forEach(b=>b.onclick=()=>{state.dishFilter=b.dataset.category;render()});
    qsa('[data-add-weight]').forEach(b=>b.onclick=()=>openWeightModal(b.dataset.member));
    qsa('[data-action="add-weight"]').forEach(b=>b.onclick=()=>openWeightModal(b.dataset.member));
    qsa('[data-random]').forEach(b=>b.onclick=()=>randomDish(b.dataset.random));
    qsa('[data-add-dish]').forEach(b=>b.onclick=()=>{state.currentMeal=b.dataset.addDish;state.view='dishes';render()});
    qsa('[data-remove-menu]').forEach(b=>b.onclick=()=>removeMenuItem(b.dataset.removeMenu,b.dataset.id));
    qsa('[data-dish]').forEach(b=>b.onclick=()=>addDishToMeal(b.dataset.dish));
    qs('[data-action="go-dishes"]')?.addEventListener('click',()=>{state.view='dishes';render()});
    qs('[data-action="new-dish"]')?.addEventListener('click',()=>openDishModal());
    qs('[data-action="switch-meal"]')?.addEventListener('click',()=>openMealModal());
    qs('[data-action="edit-profile"]')?.addEventListener('click',()=>openProfileModal());
    qs('[data-action="copy-link"]')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(location.href);showToast('链接已复制')});
    qs('[data-action="share-link"]')?.addEventListener('click',async()=>{try{await navigator.share({title:'情侣小窝',text:'加入我们的小窝 💗',url:location.href})}catch{}});
    qs('[data-action="leave"]')?.addEventListener('click',()=>{localStorage.removeItem('couple_room_token');state={...state,token:'',data:null,memberId:'',view:'home'};history.replaceState({},'',location.pathname);render()});
    if(state.view==='home') requestAnimationFrame(drawChart);
    if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  function openWeightModal(defaultMember){
    const members=state.data.couple.members; const m=defaultMember||state.memberId; const s=statsFor(m);
    showModal(`<h3>记录体重 <button class="close" data-close>×</button></h3><div class="muted">每天记录一次会更容易看出趋势。</div>
      <label class="muted" style="display:block;margin-top:14px">谁的体重</label><select id="weightMember" class="select mt8">${members.map(x=>`<option value="${x.id}" ${x.id===m?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
      <label class="muted" style="display:block;margin-top:12px">日期</label><input id="weightDate" class="input mt8" type="date" value="${today()}">
      <label class="muted" style="display:block;margin-top:12px">体重（kg）</label><input id="weightValue" class="input mt8" type="number" step="0.1" min="20" max="300" value="${s.latest?.date===today()?s.latest.value:''}" placeholder="例如 52.6">
      <button id="saveWeight" class="btn primary full mt16">保存</button>`);
    qs('#saveWeight').onclick=async()=>{const memberId=qs('#weightMember').value,date=qs('#weightDate').value,value=Number(qs('#weightValue').value);if(!date||!value||value<20||value>300){showToast('请输入正确的体重');return}const old=state.data.weights.find(x=>x.memberId===memberId&&x.date===date);if(old)old.value=value;else state.data.weights.push({id:uid(),memberId,date,value,createdAt:new Date().toISOString()});closeModal();await saveData();};
  }
  function addDishToMeal(id){const m=menuForDate(); if(!m[state.currentMeal].includes(id)){m[state.currentMeal].push(id);saveData();} else showToast('这道菜已经在本餐了');}
  function removeMenuItem(meal,id){const m=menuForDate();m[meal]=m[meal].filter(x=>x!==id);saveData()}
  function randomDish(meal){const pool=state.data.dishes.filter(d=>!menuForDate()[meal].includes(d.id)); if(!pool.length){showToast('菜品库里已经都选过了');return}const d=pool[Math.floor(Math.random()*pool.length)];menuForDate()[meal].push(d.id);saveData();showToast(`随机选中：${d.emoji} ${d.name}`)}
  function openDishModal(dish){
    dish=dish||null;
    showModal(`<h3>${dish?'编辑菜品':'添加菜品'} <button class="close" data-close>×</button></h3>
      <label class="muted">菜品名称</label><input id="dishName" class="input mt8" maxlength="20" value="${esc(dish?.name||'')}" placeholder="例如：香煎鸡胸肉">
      <label class="muted" style="display:block;margin-top:12px">emoji</label><input id="dishEmoji" class="input mt8" maxlength="2" value="${esc(dish?.emoji||'🍽️')}" placeholder="🍗">
      <label class="muted" style="display:block;margin-top:12px">分类</label><select id="dishCat" class="select mt8">${CATS.slice(1).map(c=>`<option ${c===(dish?.category||'家常菜')?'selected':''}>${c}</option>`).join('')}</select>
      ${dish?'<button id="deleteDish" class="btn danger full mt16">删除这道菜</button>':''}<button id="saveDish" class="btn primary full mt8">保存</button>`);
    qs('#saveDish').onclick=()=>{const name=qs('#dishName').value.trim(),emoji=qs('#dishEmoji').value.trim()||'🍽️',category=qs('#dishCat').value;if(!name){showToast('先写菜品名称');return}if(dish)Object.assign(dish,{name,emoji,category});else state.data.dishes.push({id:uid(),name,emoji,category});closeModal();saveData()};
    qs('#deleteDish')?.addEventListener('click',()=>{state.data.dishes=state.data.dishes.filter(x=>x.id!==dish.id);Object.values(state.data.menus).forEach(mm=>MEALS.forEach(([k])=>mm[k]=mm[k].filter(id=>id!==dish.id)));closeModal();saveData();});
  }
  function openMealModal(){ showModal(`<h3>选择当前餐次 <button class="close" data-close>×</button></h3>${MEALS.map(([k,t])=>`<button class="btn full ${state.currentMeal===k?'primary':''} mt8" data-pick-meal="${k}">${t}</button>`).join('')}`);qsa('[data-pick-meal]').forEach(b=>b.onclick=()=>{state.currentMeal=b.dataset.pickMeal;closeModal();render()}) }
  function openProfileModal(){
    const me=state.data.couple.members.find(m=>m.id===state.memberId);
    showModal(`<h3>编辑资料 <button class="close" data-close>×</button></h3><label class="muted">昵称</label><input id="profileName" class="input mt8" maxlength="12" value="${esc(me.name)}"><label class="muted" style="display:block;margin-top:12px">头像（可选）</label><input id="profileAvatar" class="input mt8" type="file" accept="image/*"><div class="muted mt8">建议使用正方形照片，系统会自动压缩。</div><button id="saveProfile" class="btn primary full mt16">保存</button>`);
    qs('#saveProfile').onclick=async()=>{me.name=qs('#profileName').value.trim()||'我';const file=qs('#profileAvatar').files[0];if(file)me.avatar=await resizeImage(file);closeModal();await saveData();};
  }
  function resizeImage(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');const s=Math.min(256,img.width,img.height);c.width=c.height=256;c.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,256,256);resolve(c.toDataURL('image/jpeg',.72))};img.onerror=reject;img.src=r.result};r.onerror=reject;r.readAsDataURL(file)})}
  function showModal(html){ const d=document.createElement('div');d.className='modal-backdrop';d.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(d);d.addEventListener('click',e=>{if(e.target===d||e.target.matches('[data-close]'))d.remove()}); }
  function closeModal(){qsa('.modal-backdrop').forEach(x=>x.remove())}

  function boot(){
    if(!isConfigured()){render();return}
    db=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);
    if(state.token){state.memberId=getLocalMember(state.token); loadRoom();}
    else render();
    setInterval(()=>{if(state.token&&document.visibilityState==='visible'&&!state.saving) loadRoom(true)},5000);
  }
  window.addEventListener('focus',()=>{if(state.token&&!state.saving)loadRoom(true)});
  boot();
})();
