/* ===========================================================
   屁孩偵測器 — 主程式
   純前端、localStorage、hash 路由
   =========================================================== */
const D = window.APP_DATA;
const $app = document.getElementById('app');
const STORE_KEY = 'pi_hai_detector_v1';

/* ---------------- 工具函式 ---------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const sample = (arr, n) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a.slice(0, n);
};
const DIFF_LABEL = { easy:'簡單', normal:'普通', hard:'挑戰' };

/* ---------------- 狀態 ---------------- */
let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return freshState();
}
function freshState() {
  const childId = uid();
  return {
    activeChild: childId,
    children: [{ id: childId, name: '寶貝', age: '7-9', color: D.CHILD_COLORS[1] }],
    stars: { [childId]: 0 },
    // 每個小孩的各模組資料： data[childId] = {...}
    data: { [childId]: blankChildData() }
  };
}
function blankChildData() {
  return {
    energyToday: null,        // {date, actions:[{...,done}], rewarded}
    levels: D.DEFAULT_LEVELS.map((l, i) => ({ ...l, done: false })),
    flows: JSON.parse(JSON.stringify({
      morning: { ...D.DEFAULT_FLOWS.morning, steps: D.DEFAULT_FLOWS.morning.steps.map(s=>({id:uid(),text:s})), checked:{}, date:'' },
      night:   { ...D.DEFAULT_FLOWS.night,   steps: D.DEFAULT_FLOWS.night.steps.map(s=>({id:uid(),text:s})), checked:{}, date:'' },
    })),
    chores: { date:'', drawn:[], doneIds:[] },
    status: {}                // status[date] = {spirit, mood, ...}
  };
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* 取得目前小孩 & 其資料（自動補齊缺漏結構） */
function child() { return state.children.find(c => c.id === state.activeChild) || state.children[0]; }
function cdata() {
  const id = state.activeChild;
  if (!state.data[id]) state.data[id] = blankChildData();
  if (state.stars[id] == null) state.stars[id] = 0;
  return state.data[id];
}
function addStars(n, ev) {
  state.stars[state.activeChild] = (state.stars[state.activeChild] || 0) + n;
  save();
  if (ev) flyStars(ev, n);
}

/* ---------------- 路由 ---------------- */
function go(route) { location.hash = route; }
function currentRoute() { return location.hash.replace('#','') || 'home'; }
window.addEventListener('hashchange', render);

/* ---------------- 共用 UI ---------------- */
function topbar(title, showStar = true) {
  const stars = state.stars[state.activeChild] || 0;
  return `<div class="topbar">
    <button class="back" onclick="go('home')">‹</button>
    <h1>${esc(title)}</h1>
    ${showStar ? `<span class="star-badge">⭐ ${stars}</span>` : ''}
  </div>`;
}

function flyStars(ev, n) {
  const x = ev?.clientX ?? window.innerWidth/2;
  const y = ev?.clientY ?? window.innerHeight/2;
  for (let i = 0; i < Math.min(n,5); i++) {
    const s = document.createElement('div');
    s.className = 'fly-star'; s.textContent = '⭐';
    s.style.left = (x - 10 + (Math.random()*40-20)) + 'px';
    s.style.top  = (y - 10) + 'px';
    s.style.animationDelay = (i*0.08) + 's';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
}

function modal(html) {
  const m = document.createElement('div');
  m.className = 'modal-mask';
  m.innerHTML = `<div class="modal">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
  return m;
}
function rewardModal(starsGained, msg) {
  modal(`
    <div class="confetti">🎉✨🎊</div>
    <div class="big">⭐</div>
    <h2>+${starsGained} 顆星星！</h2>
    <p class="muted">${esc(msg || '太棒了，繼續加油！')}</p>
    <button class="btn block green" onclick="this.closest('.modal-mask').remove()">耶！</button>
  `);
}

/* ===========================================================
   首頁
   =========================================================== */
function renderHome() {
  const c = child();
  const cd = cdata();
  const stars = state.stars[state.activeChild] || 0;
  const { summaryText, adviceText } = buildSummary(cd);

  const childChips = state.children.map(ch => `
    <button class="child-chip ${ch.id===state.activeChild?'active':''}" onclick="selectChild('${ch.id}')">
      <span class="dot" style="background:${ch.color}">${esc(ch.name.slice(0,1))}</span>
      ${esc(ch.name)}
    </button>`).join('') +
    `<button class="child-chip add" onclick="go('children')">＋ 管理</button>`;

  const menu = [
    { r:'energy',  ico:'⚡', lbl:'今日放電任務', bg:'linear-gradient(135deg,#FF6B6B,#FF9F45)' },
    { r:'levels',  ico:'🏆', lbl:'體能闖關',     bg:'linear-gradient(135deg,#4ECDC4,#5C7CFA)' },
    { r:'flows',   ico:'📋', lbl:'晨間/睡前流程', bg:'linear-gradient(135deg,#A66CFF,#FF6FB5)' },
    { r:'chores',  ico:'🎡', lbl:'家事任務輪盤', bg:'linear-gradient(135deg,#6BCB77,#4ECDC4)' },
  ].map(m => `
    <button class="menu-card" style="background:${m.bg}" onclick="go('${m.r}')">
      <span class="ico">${m.ico}</span><span class="lbl">${m.lbl}</span>
    </button>`).join('');

  $app.innerHTML = `
    <div class="hero">
      <h1>屁孩特攻隊</h1>
      <div class="sub">除了吃，今天也要好好放電 💥</div>
    </div>

    <div class="child-row">${childChips}</div>

    <div class="card summary-card">
      <div class="emoji">${summaryText.emoji}</div>
      <div style="flex:1">
        <div class="row-between">
          <strong>${esc(c.name)} 的今日狀態</strong>
          <span class="star-badge">⭐ ${stars}</span>
        </div>
        <div class="muted" style="font-size:.9rem;margin-top:4px">${summaryText.text}</div>
        <div class="advice">💡 ${adviceText}</div>
      </div>
    </div>

    <div class="menu-grid">
      ${menu}
      <button class="menu-card full" style="background:linear-gradient(135deg,#FFD93D,#FF9F45);color:#5a4500"
        onclick="go('status')">
        <span class="ico">📝</span><span class="lbl">今日狀態紀錄</span>
      </button>
    </div>
    <div class="gap16"></div>
    <p class="center"><small class="hint">資料只存在這支手機 · 不做任何醫療診斷</small></p>
  `;
}

/* 依最近狀態產生摘要 + 建議（只做生活觀察） */
function buildSummary(cd) {
  const today = cd.status[todayStr()];
  // 取最近 7 天
  const days = lastNDates(7).map(d => cd.status[d]).filter(Boolean);

  let emoji = '🙂';
  let text = '今天還沒記錄狀態，點下方「今日狀態紀錄」花 10 秒記一下吧。';
  if (today) {
    emoji = ({好:'😄',開心:'😄',普通:'🙂'})[today.mood] || ({'很累':'😴'})[today.spirit] || '🙂';
    const parts = [];
    if (today.spirit) parts.push('精神'+today.spirit);
    if (today.mood) parts.push('心情'+today.mood);
    if (today.activity) parts.push('活動量'+today.activity);
    text = parts.join('、') || '已記錄';
  }

  // 建議邏輯（純生活觀察）
  let advice = '今天狀態不錯，可以挑戰一個體能關卡！';
  const lowActivity = days.filter(d => d.activity === '不足').length;
  if (today && today.spirit === '很累') {
    advice = '今天精神偏累，建議選「簡單」難度的放電任務就好。';
  } else if (today && today.mood === '煩躁') {
    advice = '今天心情有點煩躁，來個 5 分鐘放電幫忙轉換情緒吧。';
  } else if (lowActivity >= 2) {
    advice = '最近活動量偏少，可以安排 10 分鐘室內放電。';
  } else if (!today) {
    advice = '先記錄今天的狀態，App 會幫你給今日建議。';
  } else if (today.activity === '太多') {
    advice = '今天已經放很多電了，睡前流程可以早一點開始喔。';
  }

  return { summaryText: { emoji, text }, adviceText: advice };
}
function lastNDates(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0,10));
  }
  return out;
}

/* 切換小孩 */
function selectChild(id) { state.activeChild = id; save(); render(); }

/* ===========================================================
   小孩管理
   =========================================================== */
let childForm = null; // 編輯中的暫存
function renderChildren() {
  const list = state.children.map(ch => `
    <div class="card task-item">
      <span class="n" style="background:${ch.color};color:#fff">${esc(ch.name.slice(0,1))}</span>
      <div class="body">
        <div class="t">${esc(ch.name)}</div>
        <div class="d">年齡層 ${ch.age} 歲 · ⭐ ${state.stars[ch.id]||0}</div>
      </div>
      <button class="btn ghost sm" onclick="editChild('${ch.id}')">編輯</button>
      ${state.children.length>1?`<button class="btn ghost sm" onclick="delChild('${ch.id}')">🗑️</button>`:''}
    </div>`).join('');

  $app.innerHTML = `
    ${topbar('管理小孩', false)}
    ${list}
    <button class="btn block accent" onclick="editChild(null)">＋ 新增小孩</button>
  `;
}
let childModalEl = null;
function editChild(id) {
  // 只在「開啟」時初始化一次 childForm，避免之後重繪時被洗掉
  const ch = id ? state.children.find(c=>c.id===id) : { id:null, name:'', age:'7-9', color:D.CHILD_COLORS[0] };
  childForm = { ...ch };
  childModalEl = modal(childModalInner());
}
function childModalInner() {
  const colors = D.CHILD_COLORS.map(col =>
    `<button class="choice" style="background:${col};width:38px;height:38px;border-radius:50%;padding:0;border:3px solid ${col===childForm.color?'#2B2D42':'transparent'}"
      onclick="childForm.color='${col}';childFormRefresh()"></button>`).join('');
  const ages = ['4-6','7-9','10-12'].map(a =>
    `<button class="choice ${childForm.age===a?'on':''}" onclick="childForm.age='${a}';childFormRefresh()">${a} 歲</button>`).join('');
  return `
    <h2>${childForm.id?'編輯小孩':'新增小孩'}</h2>
    <div style="text-align:left">
      <div class="field-label">名字</div>
      <input type="text" id="cf-name" value="${esc(childForm.name)}" placeholder="例如：小明" maxlength="6" oninput="childForm.name=this.value" />
      <div class="field-label">年齡層</div>
      <div class="chip-group" id="cf-ages">${ages}</div>
      <div class="field-label">代表顏色</div>
      <div class="chip-group" id="cf-colors">${colors}</div>
    </div>
    <div class="gap8"></div>
    <button class="btn block green" onclick="saveChild()">儲存</button>
    <div class="gap8"></div>
    <button class="btn block ghost" onclick="this.closest('.modal-mask').remove()">取消</button>
  `;
}
function childFormRefresh() {
  // 先把目前輸入框的名字存回 childForm，再重繪 modal 內容（保留選取狀態）
  const inp = document.getElementById('cf-name'); if (inp) childForm.name = inp.value;
  const box = childModalEl && childModalEl.querySelector('.modal');
  if (box) box.innerHTML = childModalInner();
}
function saveChild() {
  const name = (document.getElementById('cf-name').value || '').trim() || '寶貝';
  childForm.name = name;
  if (childForm.id) {
    const ch = state.children.find(c=>c.id===childForm.id);
    Object.assign(ch, { name, age: childForm.age, color: childForm.color });
  } else {
    const nid = uid();
    state.children.push({ id:nid, name, age:childForm.age, color:childForm.color });
    state.stars[nid] = 0; state.data[nid] = blankChildData();
    state.activeChild = nid;
  }
  save();
  document.querySelector('.modal-mask')?.remove();
  render();
}
function delChild(id) {
  if (state.children.length <= 1) return;
  if (!confirm('確定要刪除這個小孩的所有資料嗎？')) return;
  state.children = state.children.filter(c=>c.id!==id);
  delete state.stars[id]; delete state.data[id];
  if (state.activeChild === id) state.activeChild = state.children[0].id;
  save(); render();
}

/* ===========================================================
   模組 1：今日放電任務
   =========================================================== */
// 依現在時間判斷時段：05–11 早上、11–17 下午、其餘晚上
function currentTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  return 'evening';
}
const TIME_LABEL = { morning:'早上', afternoon:'下午', evening:'晚上' };
let energyFilter = { place:'indoor', minutes:10, time: currentTimeOfDay() };
function renderEnergy() {
  const cd = cdata();
  const c = child();
  // 若今天已產生則沿用
  const has = cd.energyToday && cd.energyToday.date === todayStr();

  const placeBtns = [['indoor','室內 🏠'],['outdoor','戶外 🌳'],['small','客廳小空間 🛋️']]
    .map(([v,l]) => `<button class="choice ${energyFilter.place===v?'on':''}" onclick="energyFilter.place='${v}';renderEnergy()">${l}</button>`).join('');
  const timeBtns = [['morning','早上 🌅'],['afternoon','下午 ☀️'],['evening','晚上 🌙']]
    .map(([v,l]) => `<button class="choice ${energyFilter.time===v?'on':''}" onclick="energyFilter.time='${v}';renderEnergy()">${l}</button>`).join('');
  const minBtns = [5,10,15]
    .map(m => `<button class="choice ${energyFilter.minutes===m?'on':''}" onclick="energyFilter.minutes=${m};renderEnergy()">${m} 分鐘</button>`).join('');
  const timeHint = energyFilter.time==='evening' ? '🌙 晚上會自動選緩和的動作，幫助好入睡'
                 : energyFilter.time==='morning' ? '🌅 早上偏喚醒型動作，幫身體開機'
                 : '☀️ 下午活力全開，什麼都能玩';

  let taskHtml;
  if (has) {
    const allDone = cd.energyToday.actions.every(a=>a.done);
    taskHtml = cd.energyToday.actions.map((a,i) => `
      <div class="card task-item">
        <span class="n">${i+1}</span>
        <div class="body">
          <div class="t">${esc(a.name)}</div>
          <div class="d">${esc(a.desc)}</div>
          <div class="task-meta">
            <span class="metric">${esc(a.metric)}</span>
            <span class="pill ${a.difficulty}">${DIFF_LABEL[a.difficulty]}</span>
          </div>
        </div>
        <button class="check ${a.done?'done':''}" onclick="toggleEnergy(${i})">${a.done?'✓':''}</button>
      </div>`).join('') + `
      <button class="btn block green" ${cd.energyToday.rewarded?'disabled':''} onclick="finishEnergy(event)">
        ${cd.energyToday.rewarded?'今日已完成 ✓':'完成今日放電！'}
      </button>
      <div class="gap8"></div>
      <button class="btn block ghost" onclick="regenEnergy()">🔄 換一組</button>`;
  } else {
    taskHtml = `<div class="empty"><div class="e">⚡</div>選好條件，按下方按鈕<br>幫 ${esc(c.name)} 產生今日放電任務！</div>
      <button class="btn block" onclick="regenEnergy()">產生今日放電任務 💥</button>`;
  }

  $app.innerHTML = `
    ${topbar('今日放電任務')}
    ${weatherBannerHTML()}
    <div class="card">
      <div class="field-label">年齡層</div><div class="muted" style="font-size:.85rem">目前小孩：${esc(c.name)}（${c.age} 歲）</div>
      <div class="field-label">時段</div>
      <div class="chip-group">${timeBtns}</div>
      <div class="field-label">場地</div>
      <div class="chip-group">${placeBtns}</div>
      <div class="field-label">時間長度</div>
      <div class="chip-group">${minBtns}</div>
      <small class="hint" style="display:block;margin-top:8px">${timeHint}</small>
    </div>
    ${taskHtml}
  `;
  loadWeatherBanner();   // 非同步抓天氣，回來後只更新天氣那塊
}

/* ---- 天氣 banner ---- */
let weatherState = null;          // 本次 session 抓到的天氣
let weatherFailed = false;
function weatherBannerHTML() {
  if (weatherFailed) {
    return `<div class="card" id="wbanner"><span class="muted">🌤️ 天氣讀取失敗，手動選場地就好</span></div>`;
  }
  if (!weatherState) {
    return `<div class="card" id="wbanner"><span class="muted">🌤️ 讀取天氣中…</span></div>`;
  }
  const w = weatherState;
  const adv = WEATHER.weatherAdvice(w);
  const placeLbl = { indoor:'室內', outdoor:'戶外', small:'客廳' }[adv.place];
  const showApply = adv.place !== energyFilter.place;
  const isDefault = w.place && w.place.indexOf('預設') >= 0;
  return `<div class="card" id="wbanner">
    <div class="row-between">
      <div><span style="font-size:1.4rem">${w.emoji}</span> <strong>${w.temp}°</strong> ${esc(w.label)}
        <small class="hint">· ${esc(w.place)}</small></div>
      ${showApply ? `<button class="btn accent sm" onclick="energyFilter.place='${adv.place}';renderEnergy()">套用：${placeLbl}</button>` : ''}
    </div>
    <div class="advice" style="margin-top:8px">💡 ${esc(adv.note)}</div>
    <div style="margin-top:8px">
      <button class="btn ghost sm" onclick="relocateWeather()">📍 ${isDefault ? '用我的實際位置' : '重新定位'}</button>
      ${isDefault ? `<small class="hint"> 目前顯示預設地區</small>` : ''}
    </div>
  </div>`;
}
async function loadWeatherBanner() {
  if (weatherState) return;       // 已有就不重抓（30 分鐘內 getWeather 也會用快取）
  try {
    weatherState = await WEATHER.getWeather();
  } catch (e) {
    weatherFailed = true;
  }
  if (currentRoute() === 'energy') {           // 使用者還在放電頁才更新 DOM
    const el = document.getElementById('wbanner');
    if (el) el.outerHTML = weatherBannerHTML();
  }
}
// 手動重新定位：清快取、重置狀態、強制重新取得 GPS
function relocateWeather() {
  try { localStorage.removeItem('pi_hai_weather_v1'); } catch (e) {}
  weatherState = null; weatherFailed = false;
  const el = document.getElementById('wbanner');
  if (el) el.innerHTML = '<span class="muted">📍 重新定位中…（請按「允許」）</span>';
  (async () => {
    try { weatherState = await WEATHER.getWeather(true); }
    catch (e) { weatherFailed = true; }
    if (currentRoute() === 'energy') {
      const el2 = document.getElementById('wbanner');
      if (el2) el2.outerHTML = weatherBannerHTML();
    }
  })();
}
function generateActions() {
  const c = child();
  const budget = energyFilter.minutes * 60;
  const inAge = a => a.ages.includes(c.age);
  const inPlace = a => a.places.includes(energyFilter.place);
  const inTime = a => a.times.includes(energyFilter.time);
  // 逐步放寬條件，確保至少有 3 個動作可選
  let pool = D.ACTION_POOL.filter(a => inAge(a) && inPlace(a) && inTime(a));
  if (pool.length < 3) pool = D.ACTION_POOL.filter(a => inPlace(a) && inTime(a));
  if (pool.length < 3) pool = D.ACTION_POOL.filter(a => inAge(a) && inPlace(a));
  if (pool.length < 3) pool = D.ACTION_POOL.filter(a => inPlace(a));
  pool = sample(pool, pool.length); // 打散
  const chosen = [];
  let total = 0;
  for (const a of pool) {
    if (chosen.length >= 5) break;
    if (chosen.length < 3 || total + a.seconds <= budget + 30) {
      chosen.push({ ...a, done:false });
      total += a.seconds;
    }
  }
  return chosen.slice(0, Math.max(3, Math.min(5, chosen.length)));
}
function regenEnergy() {
  const cd = cdata();
  cd.energyToday = { date: todayStr(), actions: generateActions(), rewarded:false };
  save(); renderEnergy();
}
function toggleEnergy(i) {
  const cd = cdata();
  cd.energyToday.actions[i].done = !cd.energyToday.actions[i].done;
  save(); renderEnergy();
}
function finishEnergy(ev) {
  const cd = cdata();
  if (cd.energyToday.rewarded) return;
  cd.energyToday.actions.forEach(a => a.done = true);
  cd.energyToday.rewarded = true;
  addStars(3, ev);
  save(); renderEnergy();
  rewardModal(3, '今日放電完成，超有活力！');
}

/* ===========================================================
   模組 2：體能闖關
   =========================================================== */
function renderLevels() {
  const cd = cdata();
  const done = cd.levels.filter(l=>l.done).length;
  const total = cd.levels.length;
  const pct = Math.round(done/total*100);

  // 第一個未完成的就是「目前可挑戰」，其後上鎖
  const firstUndone = cd.levels.findIndex(l=>!l.done);
  const items = cd.levels.map((l,i) => {
    const unlocked = l.done || i === firstUndone || firstUndone === -1;
    return `<div class="card level ${unlocked?'':'locked'}">
      <div class="badge">${unlocked ? l.emoji : '🔒'}</div>
      <div class="body" style="flex:1">
        <div class="row-between">
          <strong>${esc(l.name)}</strong>
          <span class="pill normal">${D.LEVEL_TYPE_LABEL[l.type]}</span>
        </div>
        <div class="d muted" style="font-size:.85rem">${esc(l.desc)}</div>
        <div class="task-meta"><span class="metric">🎯 ${esc(l.goal)}</span></div>
      </div>
      ${l.done
        ? `<button class="check done" onclick="toggleLevel('${l.id}')">✓</button>`
        : unlocked
          ? `<button class="btn green sm" onclick="completeLevel('${l.id}',event)">完成</button>`
          : `<span class="muted" style="font-size:.8rem">未解鎖</span>`}
    </div>`;
  }).join('');

  $app.innerHTML = `
    ${topbar('體能闖關')}
    <div class="card">
      <div class="row-between" style="margin-bottom:8px">
        <strong>闖關進度</strong><span class="metric">${done} / ${total} 關</span>
      </div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      ${done===total?`<p class="center" style="margin:10px 0 0;font-weight:900">🎉 全部破關！你是運動小超人！</p>`:''}
    </div>
    ${items}
    ${done>0?`<button class="btn block ghost" onclick="resetLevels()">重新開始所有關卡</button>`:''}
  `;
}
function completeLevel(id, ev) {
  const cd = cdata();
  const l = cd.levels.find(x=>x.id===id);
  l.done = true; addStars(2, ev); save(); renderLevels();
  rewardModal(2, `「${l.name}」破關，解鎖下一關！`);
}
function toggleLevel(id) {
  const cd = cdata();
  const l = cd.levels.find(x=>x.id===id);
  l.done = false; save(); renderLevels();
}
function resetLevels() {
  if (!confirm('重新開始所有關卡？星星不會扣除。')) return;
  cdata().levels.forEach(l=>l.done=false); save(); renderLevels();
}

/* ===========================================================
   模組 4：晨間 / 睡前流程卡
   =========================================================== */
let activeFlow = 'morning';
function renderFlows() {
  const cd = cdata();
  // 跨日重置勾選
  ['morning','night'].forEach(k => {
    const f = cd.flows[k];
    if (f.date !== todayStr()) { f.checked = {}; f.date = todayStr(); }
  });
  save();

  const tabs = [['morning','🌅 晨間'],['night','🌙 睡前']]
    .map(([k,l]) => `<button class="choice ${activeFlow===k?'on':''}" onclick="activeFlow='${k}';renderFlows()">${l}</button>`).join('');

  const f = cd.flows[activeFlow];
  const doneCount = f.steps.filter(s=>f.checked[s.id]).length;
  const allDone = doneCount === f.steps.length && f.steps.length>0;

  const steps = f.steps.map((s,i) => `
    <div class="card flow-step" draggable="true"
      ondragstart="flowDragStart(event,${i})" ondragover="event.preventDefault()" ondrop="flowDrop(event,${i})">
      <span class="grip">≡</span>
      <button class="check ${f.checked[s.id]?'done':''}" onclick="toggleFlow('${s.id}')">${f.checked[s.id]?'✓':''}</button>
      <div class="body" style="flex:1"><div class="t" style="${f.checked[s.id]?'text-decoration:line-through;color:#aaa':''}">${esc(s.text)}</div></div>
      <button class="btn ghost sm" onclick="delFlowStep('${s.id}')">🗑️</button>
    </div>`).join('');

  $app.innerHTML = `
    ${topbar('流程卡')}
    <div class="chip-group center" style="justify-content:center">${tabs}</div>
    <div class="card">
      <div class="row-between">
        <strong>${f.emoji} ${esc(f.title)}</strong>
        <span class="metric">${doneCount}/${f.steps.length}</span>
      </div>
      <div class="progress-wrap" style="margin-top:8px"><div class="progress-bar" style="width:${f.steps.length?Math.round(doneCount/f.steps.length*100):0}%"></div></div>
    </div>
    ${steps || '<div class="empty"><div class="e">📋</div>還沒有步驟，新增一個吧</div>'}
    <div class="row-between">
      <input type="text" id="newstep" placeholder="新增步驟…" style="flex:1" />
      <button class="btn accent" onclick="addFlowStep()">＋</button>
    </div>
    <div class="gap8"></div>
    <button class="btn block green" ${allDone?'':'disabled'} onclick="finishFlow(event)">
      ${allDone?'完成整個流程！⭐':'全部打勾後可領星星'}
    </button>
    <div class="gap8"></div>
    <small class="hint">提示：按住 ≡ 可拖曳調整順序</small>
  `;
}
function toggleFlow(sid) {
  const f = cdata().flows[activeFlow];
  f.checked[sid] = !f.checked[sid]; save(); renderFlows();
}
function addFlowStep() {
  const inp = document.getElementById('newstep');
  const t = (inp.value||'').trim(); if (!t) return;
  cdata().flows[activeFlow].steps.push({ id:uid(), text:t }); save(); renderFlows();
}
function delFlowStep(sid) {
  const f = cdata().flows[activeFlow];
  f.steps = f.steps.filter(s=>s.id!==sid); delete f.checked[sid]; save(); renderFlows();
}
let flowDragIdx = null;
function flowDragStart(e, i) { flowDragIdx = i; e.currentTarget.classList.add('dragging'); }
function flowDrop(e, i) {
  e.preventDefault();
  const f = cdata().flows[activeFlow];
  if (flowDragIdx===null || flowDragIdx===i) return;
  const [moved] = f.steps.splice(flowDragIdx,1);
  f.steps.splice(i,0,moved); flowDragIdx=null; save(); renderFlows();
}
let flowRewardedKey = '';
function finishFlow(ev) {
  const f = cdata().flows[activeFlow];
  const key = state.activeChild+'|'+activeFlow+'|'+todayStr();
  // 用 checked 內的旗標避免重複領（簡化：每天每流程領一次）
  if (f._rewarded === todayStr()) return;
  f._rewarded = todayStr();
  addStars(2, ev); save();
  rewardModal(2, `${f.title}完成，好棒的好習慣！`);
  renderFlows();
}

/* ===========================================================
   模組 5：家事任務輪盤
   =========================================================== */
let spinning = false;
function renderChores() {
  const cd = cdata();
  const has = cd.chores.date === todayStr() && cd.chores.drawn.length;

  let stage;
  if (spinning) {
    stage = `<div class="wheel-stage"><div style="font-size:4rem" class="spin">🎡</div></div>`;
  } else if (has) {
    stage = cd.chores.drawn.map(idx => {
      const ch = D.DEFAULT_CHORES[idx];
      const done = cd.chores.doneIds.includes(idx);
      return `<div class="card task-item">
        <span class="n" style="background:var(--bg)">${ch.emoji}</span>
        <div class="body">
          <div class="t">${esc(ch.name)}</div>
          <div class="d">${esc(ch.desc)} · 適合 ${ch.age} 歲</div>
          <div class="task-meta"><span class="metric">⭐ ${ch.stars} 顆</span></div>
        </div>
        <button class="check ${done?'done':''}" onclick="toggleChore(${idx},event)">${done?'✓':''}</button>
      </div>`;
    }).join('');
  } else {
    stage = `<div class="empty"><div class="e">🎡</div>按下面的按鈕<br>抽出今天的小任務！</div>`;
  }

  $app.innerHTML = `
    ${topbar('家事任務輪盤')}
    ${stage}
    <button class="btn block purple" ${spinning?'disabled':''} onclick="drawChores()">
      ${has?'🔄 重新抽今日小任務':'🎲 抽今日小任務'}
    </button>
    <div class="gap8"></div>
    <small class="hint center" style="display:block">每天隨機抽 1～3 個任務，完成打勾領星星</small>
  `;
}
function drawChores() {
  spinning = true; renderChores();
  setTimeout(() => {
    const n = 1 + Math.floor(Math.random()*3); // 1~3
    const idxs = sample(D.DEFAULT_CHORES.map((_,i)=>i), n);
    cdata().chores = { date: todayStr(), drawn: idxs, doneIds: [] };
    spinning = false; save(); renderChores();
  }, 700);
}
function toggleChore(idx, ev) {
  const cd = cdata();
  if (cd.chores.doneIds.includes(idx)) {
    cd.chores.doneIds = cd.chores.doneIds.filter(i=>i!==idx);
  } else {
    cd.chores.doneIds.push(idx);
    addStars(D.DEFAULT_CHORES[idx].stars, ev);
    rewardModal(D.DEFAULT_CHORES[idx].stars, `完成「${D.DEFAULT_CHORES[idx].name}」！`);
  }
  save(); renderChores();
}

/* ===========================================================
   模組 3：今日狀態紀錄
   =========================================================== */
function renderStatus() {
  const cd = cdata();
  const today = todayStr();
  const cur = cd.status[today] || {};

  const fields = D.STATUS_FIELDS.map(f => `
    <div class="status-row">
      <div class="lab">${f.emoji} ${f.label}</div>
      <div class="chip-group">
        ${f.options.map(o => `<button class="choice ${cur[f.key]===o?'on':''}" onclick="setStatus('${f.key}','${o}')">${o}</button>`).join('')}
      </div>
    </div>`).join('');

  // 最近 7 天摘要（活動量視覺化）
  const dates = lastNDates(7).reverse();
  const actMap = { '不足':1, '剛好':2, '太多':3 };
  const actColor = { '不足':'#FFB4B4', '剛好':'#6BCB77', '太多':'#FF9F45' };
  const strip = dates.map(d => {
    const s = cd.status[d];
    const lvl = s && s.activity ? actMap[s.activity] : 0;
    const col = s && s.activity ? actColor[s.activity] : '#eee';
    const h = lvl ? lvl*16+8 : 6;
    const wd = ['日','一','二','三','四','五','六'][new Date(d).getDay()];
    return `<div class="day-col">
      <div class="bar"><div class="seg" style="height:${h}px;background:${col}"></div></div>
      <div class="${d===today?'metric':'muted'}">${wd}</div>
    </div>`;
  }).join('');

  const { adviceText } = buildSummary(cd);

  $app.innerHTML = `
    ${topbar('今日狀態紀錄')}
    <div class="card">
      <strong>記錄 ${esc(child().name)} 的今天</strong>
      <small class="hint" style="display:block;margin:2px 0 6px">花 10 秒，只做生活觀察，不是醫療診斷</small>
      ${fields}
      <div class="status-row">
        <div class="lab">📝 備註</div>
        <textarea id="status-note" placeholder="今天有什麼想記下來的？" onchange="setStatusNote(this.value)">${esc(cur.note||'')}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="row-between"><strong>最近 7 天活動量</strong><small class="hint">綠=剛好 紅=不足 橘=太多</small></div>
      <div class="gap8"></div>
      <div class="week-strip">${strip}</div>
      <div class="advice">💡 ${adviceText}</div>
    </div>
  `;
}
function ensureToday() {
  const cd = cdata(); const t = todayStr();
  if (!cd.status[t]) cd.status[t] = {};
  return cd.status[t];
}
function setStatus(key, val) {
  const s = ensureToday();
  s[key] = (s[key]===val) ? undefined : val;
  save(); renderStatus();
}
function setStatusNote(v) { ensureToday().note = v; save(); }

/* ===========================================================
   主 render
   =========================================================== */
function render() {
  const r = currentRoute();
  window.scrollTo(0,0);
  ({
    home: renderHome,
    children: renderChildren,
    energy: renderEnergy,
    levels: renderLevels,
    flows: renderFlows,
    chores: renderChores,
    status: renderStatus,
  }[r] || renderHome)();
}

render();
