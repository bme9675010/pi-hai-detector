/* ===========================================================
   屁孩偵測器 — 主程式
   純前端、localStorage、hash 路由
   =========================================================== */
const D = window.APP_DATA;
const $app = document.getElementById('app');
const STORE_KEY = 'pi_hai_detector_v1';

/* ---------------- 工具函式 ---------------- */
// 用「本地時區」算日期，避免凌晨~早上時 UTC 還停在前一天
const dateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => dateStr(new Date());
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
    aiProxyUrl: '',             // AI 生成後端網址（家長在管理頁設定）
    children: [{ id: childId, name: '寶貝', age: '7-9', color: D.CHILD_COLORS[1] }],
    stars: { [childId]: 0 },
    earned: { [childId]: 0 },   // 累積「賺得」的星星（兌換不扣，用於成就）
    // 每個小孩的各模組資料： data[childId] = {...}
    data: { [childId]: blankChildData() },
    _sharedT: 0,                // 共用設定（獎勵/自訂內容）最後更新時間
    _deleted: {}                // 已刪除小孩的墓碑 {childId: time}
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
    status: {},               // status[date] = {spirit, mood, ...}
    redeemLog: [],            // 兌換紀錄 [{name, cost, date}]
    awarded: { date:'', keys:[] }, // 今日已領星星的任務，防止重複領
    activeDays: [],           // 有完成任務的日期（算連續天數 streak）
    _t: Date.now()            // 此小孩資料最後更新時間（雲端逐筆合併用）
  };
}
/* 確保獎勵清單存在（相容舊版資料） */
function ensureRewards() {
  if (!Array.isArray(state.rewards)) {
    state.rewards = D.DEFAULT_REWARDS.map(r => ({ id: uid(), ...r }));
    save();
  }
  return state.rewards;
}

/* ---------------- 自訂內容（家長可新增） ---------------- */
const AGE_RANK = { '4-6':1, '7-9':2, '10-12':3 };
// 家事：預設給穩定 id（d0,d1…），加上家長自訂的
function allChores() {
  const defs = D.DEFAULT_CHORES.map((c, i) => ({ id: 'd' + i, ...c }));
  const custom = Array.isArray(state.customChores) ? state.customChores : [];
  return [...defs, ...custom];
}
function choreById(id) { return allChores().find(c => c.id === id); }
// 依目前小孩年齡篩選適合的家事（年齡層相等或更小的）
function choresForChild() {
  const rank = AGE_RANK[child().age] || 3;
  const pool = allChores().filter(c => (AGE_RANK[c.age] || 1) <= rank);
  return pool.length ? pool : allChores();
}
// 放電動作：預設 + 自訂（自訂動作預設適用所有年齡/場地/時段）
function allActions() {
  const custom = Array.isArray(state.customActions) ? state.customActions : [];
  return [...D.ACTION_POOL, ...custom];
}

/* ---------------- 連續天數 streak ---------------- */
function markActiveToday() {
  const cd = cdata();
  if (!Array.isArray(cd.activeDays)) cd.activeDays = [];
  const t = todayStr();
  if (!cd.activeDays.includes(t)) { cd.activeDays.push(t); }
}
function computeStreak(cd) {
  const days = new Set(cd.activeDays || []);
  if (!days.size) return 0;
  // 從今天（或昨天）往回數連續天數
  let streak = 0;
  const d = new Date();
  if (!days.has(dateStr(d))) d.setDate(d.getDate() - 1);  // 今天還沒做也算還在線（從昨天起算）
  while (days.has(dateStr(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}
function save() {
  state.updatedAt = Date.now();
  // 標記「目前這個小孩」剛被更新（雲端逐筆合併用）
  const cd = state.data[state.activeChild];
  if (cd) cd._t = Date.now();
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}
function bumpShared() { state._sharedT = Date.now(); }   // 共用設定有變更時呼叫

/* ---------------- 深色模式 ---------------- */
const THEME_KEY = 'pi_hai_theme';
function applyTheme() {
  const dark = localStorage.getItem(THEME_KEY) === 'dark';
  document.body.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#1E2030' : '#FF6B6B');
}
function toggleTheme() {
  const dark = localStorage.getItem(THEME_KEY) === 'dark';
  localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark');
  applyTheme();
  if (currentRoute() === 'children') render();
}

/* ---------------- 管理頁 PIN 鎖（本機閘門，防小孩亂動） ---------------- */
const PIN_KEY = 'pi_hai_pin';
let pinUnlocked = false;                       // 本次開啟 App 已解鎖就不再問
function hasPin() { return !!localStorage.getItem(PIN_KEY); }
function setPin() {
  const v = (document.getElementById('pin-set').value || '').trim();
  if (!/^\d{4}$/.test(v)) { toast('請輸入 4 位數字'); return; }
  localStorage.setItem(PIN_KEY, v);
  pinUnlocked = false;                 // 立刻生效：下次進管理就要輸入
  toast('已開啟密碼鎖 🔒 下次進入管理需要密碼');
  go('home');
}
function removePin() {
  if (!confirm('確定要關閉密碼鎖嗎？')) return;
  localStorage.removeItem(PIN_KEY);
  toast('已關閉密碼鎖'); renderChildren();
}
function tryUnlockPin() {
  const v = (document.getElementById('pin-in').value || '').trim();
  if (v === localStorage.getItem(PIN_KEY)) { pinUnlocked = true; renderChildren(); }
  else toast('密碼不對，再試一次');
}
function renderPinGate() {
  $app.innerHTML = `
    ${topbar('管理（需要密碼）', false)}
    <div class="card center" style="margin-top:30px">
      <div style="font-size:3rem">🔒</div>
      <h2 style="margin:6px 0">請輸入管理密碼</h2>
      <p class="muted" style="font-size:.85rem">這是為了避免小孩誤改設定</p>
      <input type="password" id="pin-in" inputmode="numeric" maxlength="4" placeholder="••••"
        style="text-align:center;font-size:1.6rem;letter-spacing:8px;max-width:160px;margin:8px auto"
        onkeydown="if(event.key==='Enter')tryUnlockPin()" />
      <div class="gap8"></div>
      <button class="btn block green" onclick="tryUnlockPin()">解鎖</button>
      <div class="gap8"></div>
      <small class="hint">忘記密碼？清除瀏覽器網站資料可重設（但本機資料也會清空，請先用雲端同步或匯出備份）</small>
    </div>
  `;
}

/* 取得目前小孩 & 其資料（自動補齊缺漏結構） */
function child() { return state.children.find(c => c.id === state.activeChild) || state.children[0]; }
function cdata() {
  const id = state.activeChild;
  if (!state.data[id]) state.data[id] = blankChildData();
  if (state.stars[id] == null) state.stars[id] = 0;
  if (!Array.isArray(state.data[id].redeemLog)) state.data[id].redeemLog = [];  // 相容舊資料
  if (!state.data[id].awarded) state.data[id].awarded = { date:'', keys:[] };
  if (!Array.isArray(state.data[id].activeDays)) state.data[id].activeDays = [];
  return state.data[id];
}
function addStars(n, ev) {
  state.stars[state.activeChild] = (state.stars[state.activeChild] || 0) + n;
  if (n > 0) {
    if (!state.earned) state.earned = {};
    state.earned[state.activeChild] = (state.earned[state.activeChild] || 0) + n;
  }
  save();
  if (ev) flyStars(ev, n);
}
/* 今日是否已領過某任務的星星 */
function isAwarded(key) {
  const cd = cdata();
  return cd.awarded.date === todayStr() && cd.awarded.keys.includes(key);
}
/* 同一天同一任務只給一次星星，回傳是否真的給了 */
function awardOnce(key, n, ev, msg) {
  const cd = cdata(); const t = todayStr();
  if (cd.awarded.date !== t) cd.awarded = { date: t, keys: [] };  // 跨日重置
  if (cd.awarded.keys.includes(key)) return false;               // 今天已領過
  cd.awarded.keys.push(key);
  markActiveToday();
  addStars(n, ev);
  if (msg) rewardModal(n, msg);
  save();
  return true;
}
/* 輕量提示（已領過、提醒等） */
function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------------- 語音輸入 ---------------- */
// 一個會說話的麥克風按鈕：把辨識結果填進指定 input
function micBtn(inputId) {
  return `<button type="button" class="mic" title="語音輸入" onclick="voiceInput('${inputId}')">🎤</button>`;
}
let voiceActive = false;
function voiceInput(id) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('這個瀏覽器不支援語音輸入'); return; }
  if (voiceActive) return;
  const inp = document.getElementById(id);
  if (!inp) return;
  const rec = new SR();
  rec.lang = 'zh-TW'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onstart = () => { voiceActive = true; toast('🎤 請說話…'); inp.classList.add('listening'); };
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript.replace(/[。，、．,.\s]+$/,''); // 去尾標點
    inp.value = inp.value ? (inp.value + ' ' + text) : text;
    inp.dispatchEvent(new Event('input'));
    inp.dispatchEvent(new Event('change'));
  };
  rec.onerror = (e) => { toast('語音輸入失敗：' + (e.error === 'not-allowed' ? '請允許麥克風' : e.error)); };
  rec.onend = () => { voiceActive = false; inp.classList.remove('listening'); };
  try { rec.start(); } catch (e) { voiceActive = false; }
}

/* ---------------- AI 生成（呼叫 Cloudflare Worker 代理） ---------------- */
function aiEnabled() { return !!(state.aiProxyUrl || '').trim(); }   // 沒設定網址就不顯示 AI 按鈕
async function aiGenerate(type, params, btn) {
  if (blockedByLock()) return null;
  const url = (state.aiProxyUrl || '').trim();
  if (!url) { toast('請先到「管理」設定 AI 服務網址'); setTimeout(() => go('children'), 600); return null; }
  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = '🤖 生成中…'; }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...params }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.items || !data.items.length) throw new Error('沒有產生內容');
    return data.items;
  } catch (e) {
    toast('AI 生成失敗：' + e.message);
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}
const VALID_DIFF = { easy:1, normal:1, hard:1 };
const VALID_LVTYPE = { balance:1, jump:1, coordination:1, core:1, flexibility:1 };

async function aiEnergy(btn) {
  const items = await aiGenerate('energy', { age: child().age, place: energyFilter.place, time: energyFilter.time, count: 5 }, btn);
  if (!items) return;
  const actions = items.map(it => ({
    name: String(it.name || '動作').slice(0, 10),
    desc: String(it.desc || ''),
    metric: String(it.metric || '30 秒'),
    difficulty: VALID_DIFF[it.difficulty] ? it.difficulty : 'normal',
    ages: [child().age], places: [energyFilter.place], times: [energyFilter.time], seconds: 30,
    done: false,
  }));
  cdata().energyToday = { date: todayStr(), actions, rewarded: false };
  save(); renderEnergy();
  toast('🤖 AI 出了新動作！');
}
async function aiLevel(btn) {
  const items = await aiGenerate('level', { age: child().age, count: 3 }, btn);
  if (!items) return;
  items.forEach(it => cdata().levels.push({
    id: uid(),
    name: String(it.name || '新關卡').slice(0, 10),
    type: VALID_LVTYPE[it.type] ? it.type : 'core',
    desc: String(it.desc || ''),
    goal: String(it.goal || '完成挑戰'),
    emoji: String(it.emoji || '⭐').slice(0, 2),
    done: false,
  }));
  save(); renderLevels();
  toast('🤖 AI 加了新關卡！');
}
async function aiChore(btn) {
  const items = await aiGenerate('chore', { age: child().age, count: 3 }, btn);
  if (!items) return;
  if (!Array.isArray(state.customChores)) state.customChores = [];
  items.forEach(it => state.customChores.push({
    id: uid(),
    name: String(it.name || '家事').slice(0, 14),
    desc: String(it.desc || '幫忙做家事'),
    age: AGE_RANK[it.age] ? it.age : child().age,
    stars: Math.min(3, Math.max(1, parseInt(it.stars) || 1)),
    emoji: String(it.emoji || '🧹').slice(0, 2),
  }));
  save(); renderChores();
  toast('🤖 AI 加了新家事！');
}
async function aiFlow(btn) {
  const items = await aiGenerate('flow', { age: child().age, flow: activeFlow, count: 4 }, btn);
  if (!items) return;
  const f = cdata().flows[activeFlow];
  items.forEach(it => {
    const text = String(it.text || it.name || '').trim();
    if (text) f.steps.push({ id: uid(), text: text.slice(0, 12) });
  });
  save(); renderFlows();
  toast('🤖 AI 建議了新步驟！');
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
// 完成回饋：震動 + 上揚小音效（手機更有感）
function celebrate() {
  try { if (navigator.vibrate) navigator.vibrate([40, 30, 40]); } catch (e) {}
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [523, 659, 784].forEach((f, i) => {       // Do-Mi-Sol 上揚
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.start(t0); o.stop(t0 + 0.2);
    });
    setTimeout(() => ctx.close(), 700);
  } catch (e) {}
}
function rewardModal(starsGained, msg) {
  celebrate();
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
      <span class="ico">${m.ico}</span>
      <span><span class="lbl">${m.lbl}</span><br><span class="st">${cardStatus(m.r)}</span></span>
    </button>`).join('');

  $app.innerHTML = `
    <div class="hero">
      <h1>屁孩特攻隊</h1>
      <div class="sub">除了吃，今天也要好好放電 💥</div>
    </div>

    <div class="child-row">${childChips}</div>

    ${homeWeatherHTML()}

    <div class="card summary-card">
      <div class="emoji">${summaryText.emoji}</div>
      <div style="flex:1">
        <div class="row-between">
          <strong>${esc(c.name)} 的今日狀態</strong>
          <span class="star-badge">⭐ ${stars}</span>
        </div>
        ${computeStreak(cd) >= 2 ? `<div style="font-weight:800;color:var(--orange);font-size:.9rem;margin-top:4px">🔥 連續 ${computeStreak(cd)} 天有完成任務！</div>` : ''}
        <div class="muted" style="font-size:.9rem;margin-top:4px">${summaryText.text}</div>
        <div class="advice" id="home-advice">💡 ${homeAdvice()}</div>
      </div>
    </div>

    <div class="menu-grid">
      ${menu}
      <button class="menu-card full" style="background:linear-gradient(135deg,#FFD93D,#FF9F45);color:#5a4500"
        onclick="go('status')">
        <span class="ico">📝</span>
        <span><span class="lbl">今日狀態紀錄</span><br><span class="st">${cardStatus('status')}</span></span>
      </button>
      <button class="menu-card full" style="background:linear-gradient(135deg,#FF6FB5,#A66CFF)"
        onclick="go('rewards')">
        <span class="ico">🎁</span>
        <span><span class="lbl">星星兌換商店</span><br><span class="st">目前 ⭐ ${stars} 顆</span></span>
      </button>
    </div>
    <div class="gap16"></div>
    <p class="center"><small class="hint">資料只存在這支手機 · 不做任何醫療診斷</small></p>
  `;
  loadWeather();   // 首頁也載入天氣
}

/* 首頁用的精簡天氣條 */
function homeWeatherHTML() {
  // 讀取失敗或還沒定位 → 顯示明顯的「開啟定位」按鈕（避免使用者錯過授權）
  if (weatherFailed) {
    return `<div id="home-weather" class="card" style="padding:12px 16px">
      <div class="row-between"><span class="muted">📍 想看在地天氣？</span>
        <button class="btn accent sm" onclick="relocateWeather()">開啟定位</button></div></div>`;
  }
  if (!weatherState) return `<div id="home-weather" class="card" style="padding:12px 16px"><span class="muted">🌤️ 讀取天氣中…</span></div>`;
  const w = weatherState;
  const isDefault = w.isDefault || (w.place && w.place.indexOf('預設') >= 0);
  return `<div id="home-weather" class="card" style="padding:12px 16px">
    <div class="row-between">
      <div><span style="font-size:1.2rem">${w.emoji}</span> <strong>${w.temp}°</strong> ${esc(w.label)}
        <small class="hint">· ${esc(w.place)}</small></div>
      ${isDefault
        ? `<button class="btn accent sm" onclick="relocateWeather()">📍 用我的位置</button>`
        : `<button class="btn ghost sm" onclick="go('energy')">去放電 →</button>`}
    </div>
  </div>`;
}

/* 首頁今日建議：結合狀態紀錄 + 天氣 */
function homeAdvice() {
  let a = buildSummary(cdata()).adviceText;
  if (weatherState && !weatherFailed) {
    const adv = WEATHER.weatherAdvice(weatherState);
    if (adv.place === 'indoor') a += `　🌦️ ${weatherState.label}，今天適合室內活動。`;
    else a += `　🌳 戶外天氣不錯，把握機會出門放電！`;
  }
  return a;
}

/* 首頁卡片：今天各任務的完成狀態小字 */
function cardStatus(r) {
  const cd = cdata();
  const t = todayStr();
  if (r === 'energy') {
    if (cd.energyToday && cd.energyToday.date === t && cd.energyToday.rewarded) return '今天已完成 ✓';
    if (cd.energyToday && cd.energyToday.date === t) return '進行中…';
    return '今天還沒放電';
  }
  if (r === 'levels') {
    const done = cd.levels.filter(l => l.done).length;
    return `闖關 ${done}/${cd.levels.length}`;
  }
  if (r === 'flows') {
    const allDone = f => f.date === t && f.steps.length && f.steps.every(s => f.checked[s.id]);
    return `晨${allDone(cd.flows.morning) ? '✓' : '○'}　睡${allDone(cd.flows.night) ? '✓' : '○'}`;
  }
  if (r === 'chores') {
    if (cd.chores.date === t && cd.chores.drawn.length) return `家事 ${cd.chores.doneIds.length}/${cd.chores.drawn.length}`;
    return '今天還沒抽';
  }
  if (r === 'status') return cd.status[t] ? '今天已記錄 ✓' : '今天還沒記錄';
  return '';
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
    out.push(dateStr(d));
  }
  return out;
}

/* 切換小孩 */
function selectChild(id) { state.activeChild = id; save(); lockAcquire(); render(); }

/* ===========================================================
   小孩管理
   =========================================================== */
let childForm = null; // 編輯中的暫存
function renderChildren() {
  if (hasPin() && !pinUnlocked) { renderPinGate(); return; }   // 未解鎖先擋
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

    <div class="section-title">外觀</div>
    <div class="card row-between">
      <strong>${localStorage.getItem('pi_hai_theme')==='dark'?'🌙 深色模式':'☀️ 淺色模式'}</strong>
      <button class="btn ghost sm" onclick="toggleTheme()">切換</button>
    </div>

    <div class="section-title">AI 生成（選用）</div>
    <div class="card">
      <small class="hint" style="display:block;margin-bottom:8px">
        貼上你的 Cloudflare Worker 網址，各任務就會出現「🎲 AI 生成」。沒設定也能正常用。
      </small>
      <input type="text" id="ai-url" value="${esc(state.aiProxyUrl||'')}" placeholder="https://pi-hai-ai.xxx.workers.dev" />
      <div class="gap8"></div>
      <button class="btn block green" onclick="saveAiUrl()">儲存網址</button>
    </div>

    <div class="section-title">這台裝置名稱</div>
    <div class="card">
      <small class="hint" style="display:block;margin-bottom:8px">取一個好認的名字（如「爸爸手機」），別台被鎖時會顯示是誰在用。</small>
      <div class="row-between">
        <input type="text" id="dev-name" value="${esc(localStorage.getItem('pi_hai_device')||'')}" placeholder="例如：哥哥的平板" maxlength="16" style="flex:1" />
        <button class="btn green" onclick="saveDeviceName()">儲存</button>
      </div>
    </div>

    <div class="section-title">雲端同步（多裝置）</div>
    <div class="card">
      <small class="hint" style="display:block;margin-bottom:8px">
        全家用同一組同步碼（≥6 字）。每個小孩的進度各自合併，<b>不同裝置同時用也不會互相蓋掉</b>。需先設好上面的服務網址。
      </small>
      <div class="row-between">
        <input type="password" id="sync-code" value="${esc(localStorage.getItem('pi_hai_sync_code')||'')}" placeholder="全家共用同步碼，例如 family-code" style="flex:1" />
        <button class="btn ghost sm" onclick="toggleSyncReveal(this)">👁️</button>
      </div>
      <div class="gap8"></div>
      <button class="btn block green" onclick="syncNow(false,this)">☁️ 立即同步（雙向合併）</button>
      <div class="gap8"></div>
      <div class="row-between">
        <strong style="font-size:.9rem">${localStorage.getItem('pi_hai_autosync')==='0'?'⛅ 開啟 App 自動同步：關':'☁️ 開啟 App 自動同步：開'}</strong>
        <button class="btn ghost sm" onclick="toggleAutoSync()">切換</button>
      </div>
      <small class="hint" style="display:block;margin-top:6px">開啟後，每次打開 App 會自動雙向同步（小孩各自的進度合併，不互相覆蓋）。</small>
      <div class="gap8"></div>
      <div class="row-between">
        <strong style="font-size:.9rem">${localStorage.getItem('pi_hai_lock')==='0'?'🔓 即時編輯鎖：關':'🔒 即時編輯鎖：開'}</strong>
        <button class="btn ghost sm" onclick="toggleLock()">切換</button>
      </div>
      <small class="hint" style="display:block;margin-top:6px">開啟後，同一個小孩同時只有一台能編輯，其他台會是檢視模式，等對方切換小孩或關閉才解鎖。</small>
    </div>

    <div class="section-title">管理頁密碼鎖</div>
    <div class="card">
      <small class="hint" style="display:block;margin-bottom:8px">
        開啟後，每次進入「管理」都要輸入 4 位數字密碼（離開就重新上鎖），避免小孩誤改設定。（這是防手殘的閘門，非高強度資安）
      </small>
      ${hasPin()
        ? `<div class="row-between"><strong>🔒 密碼鎖已開啟</strong>
            <button class="btn ghost sm" onclick="removePin()">關閉</button></div>`
        : `<div class="row-between">
            <input type="password" id="pin-set" inputmode="numeric" maxlength="4" placeholder="設 4 位數字" style="flex:1" />
            <button class="btn green" onclick="setPin()">開啟</button></div>`}
    </div>

    <div class="section-title">資料備份</div>
    <div class="card">
      <small class="hint" style="display:block;margin-bottom:10px">
        所有資料只存在這支手機。換手機或清快取前，記得先匯出備份。
      </small>
      <button class="btn block green" onclick="exportData()">⬇️ 匯出備份檔</button>
      <div class="gap8"></div>
      <button class="btn block ghost" onclick="document.getElementById('importfile').click()">⬆️ 匯入還原</button>
      <input type="file" id="importfile" accept="application/json,.json" style="display:none" onchange="importData(event)" />
    </div>
  `;
}

/* 匯出整包資料成 JSON 檔 */
function exportData() {
  const payload = { app: '屁孩特攻隊', version: 1, exportedAt: new Date().toISOString(), state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `屁孩特攻隊備份_${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* 匯入備份檔還原 */
function importData(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const s = parsed.state || parsed;   // 容許直接是 state 或包了一層
      if (!s || !Array.isArray(s.children) || s.children.length === 0) {
        throw new Error('格式不符');
      }
      const names = s.children.map(c => c.name).join('、');
      if (!confirm(`確定要還原嗎？\n這會「覆蓋」目前手機上的所有資料。\n\n備份內含小孩：${names}`)) {
        ev.target.value = ''; return;
      }
      state = s;
      if (!state.activeChild || !state.children.find(c => c.id === state.activeChild)) {
        state.activeChild = state.children[0].id;
      }
      save();
      ev.target.value = '';
      go('home'); render();
      modal(`<div class="big">🎉</div><h2>還原成功！</h2>
        <p class="muted">已載入 ${state.children.length} 位小孩的資料</p>
        <button class="btn block green" onclick="this.closest('.modal-mask').remove()">好</button>`);
    } catch (e) {
      alert('匯入失敗：這不是有效的備份檔。\n（' + e.message + '）');
      ev.target.value = '';
    }
  };
  reader.readAsText(file);
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
      <div class="voice-field"><input type="text" id="cf-name" value="${esc(childForm.name)}" placeholder="例如：小明" maxlength="6" oninput="childForm.name=this.value" />${micBtn('cf-name')}</div>
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
    if (state.data[childForm.id]) state.data[childForm.id]._t = Date.now();  // 標記此小孩有更新
    state.activeChild = childForm.id;   // 讓 save() 標記到正確的小孩
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
function saveAiUrl() {
  state.aiProxyUrl = (document.getElementById('ai-url').value || '').trim();
  save();
  toast(state.aiProxyUrl ? 'AI 服務網址已儲存 ✓' : '已清除 AI 網址');
}

/* ---------------- 雲端同步（用同步碼 + Worker KV） ---------------- */
const SYNC_CODE_KEY = 'pi_hai_sync_code';
function syncBase() {
  const u = (state.aiProxyUrl || '').trim().replace(/\/+$/, '');
  return u;
}
function toggleSyncReveal(btn) {
  const inp = document.getElementById('sync-code');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁️' : '🙈';
}
function toggleAutoSync() {
  const off = localStorage.getItem('pi_hai_autosync') === '0';
  localStorage.setItem('pi_hai_autosync', off ? '1' : '0');   // 切換
  toast(off ? '已開啟自動同步' : '已關閉自動同步');
  renderChildren();
}
function saveDeviceName() {
  localStorage.setItem('pi_hai_device', (document.getElementById('dev-name').value || '').trim());
  if (lockWs && lockWs.readyState === 1) lockWs.send(JSON.stringify({ type: 'hello', name: deviceName() }));
  toast('裝置名稱已儲存');
}
function toggleLock() {
  const off = localStorage.getItem('pi_hai_lock') === '0';
  localStorage.setItem('pi_hai_lock', off ? '1' : '0');   // 切換
  if (off) { lockConnect(); toast('已開啟即時編輯鎖'); }
  else { lockRelease(); if (lockWs) try { lockWs.close(); } catch (e) {} lockWs = null; lockMap = {}; prevLockedOut = false; toast('已關閉即時編輯鎖'); }
  renderChildren();
}
// 把本機資料打包成「雲端文件」格式（每個小孩各帶時間戳）
function buildCloudDoc() {
  const doc = {
    children: {},
    shared: {
      rewards: Array.isArray(state.rewards) ? state.rewards : [],   // 不在這裡 ensure，避免觸發 save 改到時間戳
      customChores: state.customChores || [],
      customActions: state.customActions || [],
      t: state._sharedT || 0,
    },
    deleted: state._deleted || {},
  };
  for (const c of state.children) {
    const cid = c.id;
    const cd = state.data[cid] || blankChildData();
    doc.children[cid] = {
      profile: { id: cid, name: c.name, age: c.age, color: c.color },
      stars: state.stars[cid] || 0,
      earned: (state.earned && state.earned[cid]) || 0,
      data: cd,
      t: cd._t || 0,
    };
  }
  return doc;
}
// 把合併後的雲端文件套回本機（保留本機專屬：AI 網址、目前選擇的小孩）
function applyMerged(doc) {
  if (!doc || !doc.children) return false;
  const children = [], stars = {}, earned = {}, data = {};
  for (const cid in doc.children) {
    const rec = doc.children[cid];
    if (!rec || !rec.profile) continue;
    children.push(rec.profile);
    stars[cid] = rec.stars || 0;
    earned[cid] = rec.earned || 0;
    data[cid] = rec.data || blankChildData();
  }
  if (!children.length) return false;             // 雲端是空的就別清掉本機
  state.children = children; state.stars = stars; state.earned = earned; state.data = data;
  if (doc.shared) {
    if (Array.isArray(doc.shared.rewards)) state.rewards = doc.shared.rewards;
    state.customChores = doc.shared.customChores || [];
    state.customActions = doc.shared.customActions || [];
    state._sharedT = doc.shared.t || 0;
  }
  state._deleted = doc.deleted || {};
  if (!state.activeChild || !state.children.find(c => c.id === state.activeChild)) state.activeChild = state.children[0].id;
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  return true;
}
// 雙向同步：把本機送上去合併，再把合併結果套回（不會互相覆蓋，逐小孩比時間戳）
async function syncNow(silent, btn) {
  const base = syncBase();
  const field = document.getElementById('sync-code');
  const code = (field ? field.value : (localStorage.getItem(SYNC_CODE_KEY) || '')).trim();
  if (!base || code.length < 6) { if (!silent) toast('請先設定服務網址與同步碼（≥6 字）'); return; }
  if (field) localStorage.setItem(SYNC_CODE_KEY, code);
  let orig;
  if (btn) { orig = btn.textContent; btn.disabled = true; btn.textContent = '☁️ 同步中…'; }
  try {
    const res = await fetch(base + '/sync/merge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, doc: buildCloudDoc() }),
    });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || ('HTTP ' + res.status));
    applyMerged(d.doc);
    render();
    if (!silent) toast('☁️ 已同步（每個小孩各自合併）');
  } catch (e) { if (!silent) toast('同步失敗：' + e.message); }
  finally { if (btn) { btn.disabled = false; btn.textContent = orig; } }
}
// 開啟 App / 回前景自動雙向同步
function autoSyncPull() {
  if (localStorage.getItem('pi_hai_autosync') === '0') return;
  syncNow(true, null);
}

/* ---------------- 即時編輯鎖（WebSocket → Worker Durable Object） ---------------- */
let lockWs = null, lockSid = null, lockMap = {}, lockReconnect = null, prevLockedOut = false;
function deviceName() { return (localStorage.getItem('pi_hai_device') || '').trim() || '某台裝置'; }
function lockEnabled() {
  return localStorage.getItem('pi_hai_lock') !== '0'
    && !!syncBase() && (localStorage.getItem(SYNC_CODE_KEY) || '').trim().length >= 6;
}
function lockedOut() {                       // 目前這個小孩被「別台」鎖住？
  const h = lockMap[state.activeChild];
  return !!(h && h.sid && h.sid !== lockSid);
}
function lockHolderName() { const h = lockMap[state.activeChild]; return h ? h.by : ''; }
function blockedByLock() {                   // 任務操作前呼叫，被鎖就擋下並提示
  if (lockedOut()) { toast('⏳ ' + (lockHolderName() || '其他裝置') + ' 正在使用，請等對方結束'); return true; }
  return false;
}
function lockConnect() {
  if (!lockEnabled()) return;
  if (lockWs && (lockWs.readyState === 0 || lockWs.readyState === 1)) { lockAcquire(); return; }
  const base = syncBase().replace(/^http/, 'ws');
  const code = (localStorage.getItem(SYNC_CODE_KEY) || '').trim();
  try { lockWs = new WebSocket(base + '/room?code=' + encodeURIComponent(code)); }
  catch (e) { return; }
  lockWs.onopen = () => { lockWs.send(JSON.stringify({ type: 'hello', name: deviceName() })); lockAcquire(); };
  lockWs.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'welcome') { lockSid = m.sid; lockAcquire(); }
    else if (m.type === 'locks') { lockMap = m.locks || {}; evalLock(); }
  };
  lockWs.onclose = () => { lockWs = null; if (lockEnabled()) { clearTimeout(lockReconnect); lockReconnect = setTimeout(lockConnect, 4000); } };
  lockWs.onerror = () => { try { lockWs.close(); } catch (e) {} };
}
function lockAcquire() {
  if (lockWs && lockWs.readyState === 1) lockWs.send(JSON.stringify({ type: 'acquire', childId: state.activeChild, name: deviceName() }));
}
function lockRelease() {
  if (lockWs && lockWs.readyState === 1) lockWs.send(JSON.stringify({ type: 'release' }));
}
function evalLock() {
  if (!lockMap[state.activeChild]) lockAcquire();   // 沒人持有就自己搶
  const now = lockedOut();
  renderLockBar();
  if (now !== prevLockedOut) { prevLockedOut = now; render(); }   // 唯讀↔可編輯切換時重繪
}
function renderLockBar() {
  const bar = document.getElementById('lockbar');
  if (!bar) return;
  if (lockedOut()) {
    bar.style.display = 'block';
    bar.textContent = '⏳ ' + (lockHolderName() || '其他裝置') + ' 正在使用「' + (child() ? child().name : '') + '」，你目前是檢視模式';
  } else {
    bar.style.display = 'none';
  }
}
function delChild(id) {
  if (state.children.length <= 1) return;
  if (!confirm('確定要刪除這個小孩的所有資料嗎？')) return;
  state.children = state.children.filter(c=>c.id!==id);
  delete state.stars[id]; delete state.data[id];
  if (!state._deleted) state._deleted = {};
  state._deleted[id] = Date.now();          // 墓碑：讓刪除也能同步到其他裝置
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
      <button class="btn block green" ${isAwarded('energy')?'disabled':''} onclick="finishEnergy(event)">
        ${isAwarded('energy')?'今日已完成 ✓':'完成今日放電！'}
      </button>
      <div class="gap8"></div>
      ${aiEnabled() ? `<div class="row-between">
        <button class="btn ghost" style="flex:1" onclick="regenEnergy()">🔄 換一組</button>
        <button class="btn purple" style="flex:1" onclick="aiEnergy(this)">🎲 AI 出新動作</button>
      </div>` : `<button class="btn block ghost" onclick="regenEnergy()">🔄 換一組</button>`}`;
  } else {
    taskHtml = `<div class="empty"><div class="e">⚡</div>選好條件，按下方按鈕<br>幫 ${esc(c.name)} 產生今日放電任務！</div>
      <button class="btn block" onclick="regenEnergy()">產生今日放電任務 💥</button>
      ${aiEnabled() ? `<div class="gap8"></div><button class="btn block purple" onclick="aiEnergy(this)">🎲 用 AI 產生</button>` : ''}`;
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

    <div class="section-title">自己加放電動作</div>
    ${(state.customActions||[]).map(a => `
      <div class="card task-item">
        <span class="n" style="background:var(--bg)">💪</span>
        <div class="body"><div class="t">${esc(a.name)}</div><div class="d">${esc(a.desc)} · ${esc(a.metric)}</div></div>
        <button class="btn ghost sm" onclick="delCustomAction('${a.id}')">🗑️</button>
      </div>`).join('')}
    <div class="card">
      <div class="voice-field"><input type="text" id="ca-name" placeholder="動作名稱，例如：跳繩" maxlength="12" />${micBtn('ca-name')}</div>
      <div class="gap8"></div>
      <input type="text" id="ca-desc" placeholder="說明（選填）" maxlength="24" />
      <div class="gap8"></div>
      <div class="row-between">
        <input type="text" id="ca-metric" placeholder="時間/次數，例如：30 下" maxlength="10" style="flex:1" />
        <select id="ca-diff" class="choice" style="width:90px">
          <option value="easy">簡單</option><option value="normal" selected>普通</option><option value="hard">挑戰</option>
        </select>
        <button class="btn accent" onclick="addCustomAction()">＋</button>
      </div>
      <small class="hint" style="display:block;margin-top:6px">自訂動作會適用所有年齡、場地、時段</small>
    </div>
  `;
  loadWeather();   // 非同步抓天氣，回來後只更新天氣那塊
}
function addCustomAction() {
  const name = (document.getElementById('ca-name').value || '').trim();
  const desc = (document.getElementById('ca-desc').value || '').trim() || '加油動一動';
  const metric = (document.getElementById('ca-metric').value || '').trim() || '30 秒';
  const difficulty = document.getElementById('ca-diff').value;
  if (!name) { alert('請輸入動作名稱'); return; }
  if (!Array.isArray(state.customActions)) state.customActions = [];
  state.customActions.push({
    id: uid(), name, desc, metric, difficulty,
    ages: ['4-6','7-9','10-12'], places: ['indoor','outdoor','small'],
    times: ['morning','afternoon','evening'], seconds: 30
  });
  bumpShared(); save(); renderEnergy();
}
function delCustomAction(id) {
  if (!confirm('刪除這個自訂動作？')) return;
  state.customActions = (state.customActions || []).filter(a => a.id !== id);
  bumpShared(); save(); renderEnergy();
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
  const isDefault = w.isDefault || (w.place && w.place.indexOf('預設') >= 0);
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
// 天氣回來後，依目前頁面更新對應的 DOM（首頁 or 放電頁）
function refreshWeatherDOM() {
  const r = currentRoute();
  if (r === 'energy') { const el = document.getElementById('wbanner'); if (el) el.outerHTML = weatherBannerHTML(); }
  else if (r === 'home') {
    const el = document.getElementById('home-weather'); if (el) el.outerHTML = homeWeatherHTML();
    const adv = document.getElementById('home-advice'); if (adv) adv.innerHTML = '💡 ' + homeAdvice();
  }
}
async function loadWeather() {
  if (weatherState || weatherFailed) { refreshWeatherDOM(); return; }  // 已有結果就直接套用
  try { weatherState = await WEATHER.getWeather(false, syncBase()); }
  catch (e) { weatherFailed = true; }
  refreshWeatherDOM();
}
// 手動重新定位：清快取、重置狀態、強制重新取得 GPS
function relocateWeather() {
  try { localStorage.removeItem('pi_hai_weather_v1'); } catch (e) {}
  weatherState = null; weatherFailed = false;
  const el = document.getElementById('wbanner');
  if (el) el.innerHTML = '<span class="muted">📍 重新定位中…（請按「允許」）</span>';
  (async () => {
    try { weatherState = await WEATHER.getWeather(true, syncBase()); }
    catch (e) { weatherFailed = true; }
    refreshWeatherDOM();
  })();
}
function generateActions() {
  const c = child();
  const ALL = allActions();
  const budget = energyFilter.minutes * 60;
  const inAge = a => a.ages.includes(c.age);
  const inPlace = a => a.places.includes(energyFilter.place);
  const inTime = a => a.times.includes(energyFilter.time);
  // 逐步放寬條件，確保至少有 3 個動作可選
  let pool = ALL.filter(a => inAge(a) && inPlace(a) && inTime(a));
  if (pool.length < 3) pool = ALL.filter(a => inPlace(a) && inTime(a));
  if (pool.length < 3) pool = ALL.filter(a => inAge(a) && inPlace(a));
  if (pool.length < 3) pool = ALL.filter(a => inPlace(a));
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
  if (blockedByLock()) return;
  const cd = cdata();
  cd.energyToday = { date: todayStr(), actions: generateActions(), rewarded:false };
  save(); renderEnergy();
}
function toggleEnergy(i) {
  if (blockedByLock()) return;
  const cd = cdata();
  cd.energyToday.actions[i].done = !cd.energyToday.actions[i].done;
  save(); renderEnergy();
}
function finishEnergy(ev) {
  if (blockedByLock()) return;
  const cd = cdata();
  cd.energyToday.actions.forEach(a => a.done = true);
  cd.energyToday.rewarded = true;
  const got = awardOnce('energy', 3, ev, '今日放電完成，超有活力！');
  save(); renderEnergy();
  if (!got) toast('今天的放電星星已經領過囉 ⭐');
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
      <button class="btn ghost sm" onclick="delLevel('${l.id}')">🗑️</button>
    </div>`;
  }).join('');

  const typeOpts = Object.entries(D.LEVEL_TYPE_LABEL)
    .map(([v,l]) => `<option value="${v}">${l}</option>`).join('');

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

    ${aiEnabled() ? `<button class="btn block purple" onclick="aiLevel(this)">🎲 AI 加新關卡</button>` : ''}
    <div class="section-title">自己加關卡</div>
    <div class="card">
      <div class="voice-field"><input type="text" id="lv-name" placeholder="關卡名稱，例如：超人飛行" maxlength="10" />${micBtn('lv-name')}</div>
      <div class="gap8"></div>
      <input type="text" id="lv-goal" placeholder="完成條件，例如：平板撐 20 秒" maxlength="16" />
      <div class="gap8"></div>
      <div class="row-between">
        <select id="lv-type" class="choice" style="flex:1">${typeOpts}</select>
        <input type="text" id="lv-emoji" placeholder="圖示" value="⭐" maxlength="2" style="width:70px;text-align:center" />
        <button class="btn accent" onclick="addLevel()">＋</button>
      </div>
    </div>
  `;
}
function addLevel() {
  if (blockedByLock()) return;
  const name = (document.getElementById('lv-name').value || '').trim();
  const goal = (document.getElementById('lv-goal').value || '').trim() || '完成挑戰';
  const type = document.getElementById('lv-type').value;
  const emoji = (document.getElementById('lv-emoji').value || '⭐').trim() || '⭐';
  if (!name) { alert('請輸入關卡名稱'); return; }
  cdata().levels.push({ id: uid(), name, type, desc: goal, goal, emoji, done: false });
  save(); renderLevels();
}
function delLevel(id) {
  if (blockedByLock()) return;
  if (!confirm('刪除這個關卡？')) return;
  const cd = cdata();
  cd.levels = cd.levels.filter(l => l.id !== id);
  save(); renderLevels();
}
function completeLevel(id, ev) {
  if (blockedByLock()) return;
  const cd = cdata();
  const l = cd.levels.find(x=>x.id===id);
  l.done = true;
  const got = awardOnce('level:'+id, 2, ev, `「${l.name}」破關，解鎖下一關！`);
  save(); renderLevels();
  if (!got) toast('這關今天已經領過星星囉 ⭐');
}
function toggleLevel(id) {
  if (blockedByLock()) return;
  const cd = cdata();
  const l = cd.levels.find(x=>x.id===id);
  l.done = false; save(); renderLevels();
}
function resetLevels() {
  if (blockedByLock()) return;
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
      <div class="reorder">
        <button class="rbtn" ${i===0?'disabled':''} onclick="moveFlowStep(${i},-1)">▲</button>
        <button class="rbtn" ${i===f.steps.length-1?'disabled':''} onclick="moveFlowStep(${i},1)">▼</button>
      </div>
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
      ${micBtn('newstep')}
      <button class="btn accent" onclick="addFlowStep()">＋</button>
    </div>
    <div class="gap8"></div>
    <button class="btn block green" ${(isAwarded('flow:'+activeFlow)||!allDone)?'disabled':''} onclick="finishFlow(event)">
      ${isAwarded('flow:'+activeFlow) ? '今天已完成 ✓' : allDone ? '完成整個流程！⭐' : '全部打勾後可領星星'}
    </button>
    ${aiEnabled() ? `<div class="gap8"></div><button class="btn block purple" onclick="aiFlow(this)">🎲 AI 建議${f.title}步驟</button>` : ''}
    <div class="gap8"></div>
    <small class="hint">提示：用 ▲▼ 調整步驟順序（電腦也可拖曳）</small>
  `;
}
// 上移/下移流程步驟（手機觸控可用）
function moveFlowStep(i, dir) {
  if (blockedByLock()) return;
  const f = cdata().flows[activeFlow];
  const j = i + dir;
  if (j < 0 || j >= f.steps.length) return;
  [f.steps[i], f.steps[j]] = [f.steps[j], f.steps[i]];
  save(); renderFlows();
}
function toggleFlow(sid) {
  if (blockedByLock()) return;
  const f = cdata().flows[activeFlow];
  f.checked[sid] = !f.checked[sid]; save(); renderFlows();
}
function addFlowStep() {
  if (blockedByLock()) return;
  const inp = document.getElementById('newstep');
  const t = (inp.value||'').trim(); if (!t) return;
  cdata().flows[activeFlow].steps.push({ id:uid(), text:t }); save(); renderFlows();
}
function delFlowStep(sid) {
  if (blockedByLock()) return;
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
function finishFlow(ev) {
  if (blockedByLock()) return;
  const f = cdata().flows[activeFlow];
  const got = awardOnce('flow:'+activeFlow, 2, ev, `${f.title}完成，好棒的好習慣！`);
  if (got) f._rewarded = todayStr();
  save(); renderFlows();
  if (!got) toast('這個流程今天已經領過星星囉 ⭐');
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
    stage = cd.chores.drawn.map(id => {
      const ch = choreById(id);
      if (!ch) return '';
      const done = cd.chores.doneIds.includes(id);
      return `<div class="card task-item">
        <span class="n" style="background:var(--bg)">${ch.emoji || '🧹'}</span>
        <div class="body">
          <div class="t">${esc(ch.name)}</div>
          <div class="d">${esc(ch.desc)} · 適合 ${ch.age} 歲</div>
          <div class="task-meta"><span class="metric">⭐ ${ch.stars} 顆</span></div>
        </div>
        <button class="check ${done?'done':''}" onclick="toggleChore('${id}',event)">${done?'✓':''}</button>
      </div>`;
    }).join('');
  } else {
    stage = `<div class="empty"><div class="e">🎡</div>按下面的按鈕<br>抽出今天的小任務！</div>`;
  }

  // 家長自訂家事清單
  const custom = (state.customChores || []).map(c =>
    `<div class="card task-item">
      <span class="n" style="background:var(--bg)">${c.emoji || '🧹'}</span>
      <div class="body"><div class="t">${esc(c.name)}</div>
        <div class="d">${esc(c.desc)} · 適合 ${c.age} 歲 · ⭐${c.stars}</div></div>
      <button class="btn ghost sm" onclick="delCustomChore('${c.id}')">🗑️</button>
    </div>`).join('');

  $app.innerHTML = `
    ${topbar('家事任務輪盤')}
    ${stage}
    <button class="btn block purple" ${spinning?'disabled':''} onclick="drawChores()">
      ${has?'🔄 重新抽今日小任務':'🎲 抽今日小任務'}
    </button>
    <div class="gap8"></div>
    <small class="hint center" style="display:block">依 ${esc(child().name)}（${child().age} 歲）抽 1～3 個適齡任務</small>

    ${aiEnabled() ? `<button class="btn block purple" onclick="aiChore(this)">🎲 AI 加新家事</button>` : ''}
    <div class="section-title">自己加家事</div>
    ${custom}
    <div class="card">
      <div class="voice-field"><input type="text" id="cc-name" placeholder="家事名稱，例如：幫忙摺被子" maxlength="14" />${micBtn('cc-name')}</div>
      <div class="gap8"></div>
      <input type="text" id="cc-desc" placeholder="說明（選填）" maxlength="24" />
      <div class="gap8"></div>
      <div class="row-between">
        <select id="cc-age" class="choice" style="flex:1">
          <option value="4-6">4-6 歲</option><option value="7-9" selected>7-9 歲</option><option value="10-12">10-12 歲</option>
        </select>
        <input type="number" id="cc-stars" placeholder="星星" min="1" value="1" style="width:80px" />
        <button class="btn accent" onclick="addCustomChore()">＋</button>
      </div>
    </div>
  `;
}
function drawChores() {
  if (blockedByLock()) return;
  spinning = true; renderChores();
  setTimeout(() => {
    const pool = choresForChild();
    const n = Math.min(pool.length, 1 + Math.floor(Math.random()*3)); // 1~3
    const ids = sample(pool.map(c => c.id), n);
    cdata().chores = { date: todayStr(), drawn: ids, doneIds: [] };
    spinning = false; save(); renderChores();
  }, 700);
}
function toggleChore(id, ev) {
  if (blockedByLock()) return;
  const cd = cdata();
  const ch = choreById(id);
  if (cd.chores.doneIds.includes(id)) {
    cd.chores.doneIds = cd.chores.doneIds.filter(i => i !== id);   // 取消打勾不退星
  } else {
    cd.chores.doneIds.push(id);
    const got = awardOnce('chore:'+id, (ch && ch.stars) || 1, ev, `完成「${ch ? ch.name : '家事'}」！`);
    if (!got) toast('這個家事今天已經領過星星囉 ⭐');
  }
  save(); renderChores();
}
function addCustomChore() {
  const name = (document.getElementById('cc-name').value || '').trim();
  const desc = (document.getElementById('cc-desc').value || '').trim() || '幫忙做家事';
  const age = document.getElementById('cc-age').value;
  const stars = parseInt(document.getElementById('cc-stars').value, 10) || 1;
  if (!name) { alert('請輸入家事名稱'); return; }
  if (!Array.isArray(state.customChores)) state.customChores = [];
  state.customChores.push({ id: uid(), name, desc, age, stars, emoji: '🧹' });
  bumpShared(); save(); renderChores();
}
function delCustomChore(id) {
  if (!confirm('刪除這個自訂家事？')) return;
  state.customChores = (state.customChores || []).filter(c => c.id !== id);
  bumpShared(); save(); renderChores();
}

/* ===========================================================
   成就徽章
   =========================================================== */
function getAchievements() {
  const cd = cdata();
  const earned = (state.earned && state.earned[state.activeChild]) || 0;
  const levelsDone = cd.levels.filter(l => l.done).length;
  const statusDays = Object.keys(cd.status).length;
  const redeems = cd.redeemLog.length;
  const streak = computeStreak(cd);
  return [
    { emoji:'⭐', name:'初次放電', desc:'賺到第一顆星',     done: earned >= 1 },
    { emoji:'🌟', name:'星星新手', desc:'累積賺 20 顆星',   done: earned >= 20 },
    { emoji:'💫', name:'星星達人', desc:'累積賺 50 顆星',   done: earned >= 50 },
    { emoji:'✨', name:'星星大師', desc:'累積賺 100 顆星',  done: earned >= 100 },
    { emoji:'🏆', name:'闖關高手', desc:'完成 5 個關卡',     done: levelsDone >= 5 },
    { emoji:'👑', name:'全破關王', desc:'完成所有關卡',       done: cd.levels.length > 0 && levelsDone >= cd.levels.length },
    { emoji:'🔥', name:'三天有恆', desc:'連續 3 天完成任務', done: streak >= 3 },
    { emoji:'💪', name:'七天達人', desc:'連續 7 天完成任務', done: streak >= 7 },
    { emoji:'📅', name:'觀察日記', desc:'記錄 7 天狀態',     done: statusDays >= 7 },
    { emoji:'🎁', name:'兌換高手', desc:'兌換 3 次獎勵',     done: redeems >= 3 },
  ];
}
function achievementsHTML() {
  const list = getAchievements();
  const gotN = list.filter(a => a.done).length;
  return `<div class="row-between"><strong>成就徽章</strong><span class="metric">${gotN}/${list.length}</span></div>
    <div class="gap8"></div>
    <div class="badge-grid">
      ${list.map(a => `<div class="badge-item ${a.done ? 'got' : ''}" title="${esc(a.desc)}">
        <div class="b-emoji">${a.done ? a.emoji : '🔒'}</div>
        <div class="b-name">${esc(a.name)}</div>
        <div class="b-desc">${esc(a.desc)}</div>
      </div>`).join('')}
    </div>`;
}

/* ===========================================================
   星星兌換商店
   =========================================================== */
function renderRewards() {
  const rewards = ensureRewards();
  const cd = cdata();
  const stars = state.stars[state.activeChild] || 0;

  const list = rewards.length ? rewards.map(r => {
    const can = stars >= r.cost;
    return `<div class="card task-item">
      <span class="n" style="background:var(--bg)">${r.emoji || '🎁'}</span>
      <div class="body">
        <div class="t">${esc(r.name)}</div>
        <div class="d"><span class="metric">⭐ ${r.cost}</span> ${can ? '' : `· 還差 ${r.cost - stars} 顆`}</div>
      </div>
      <button class="btn ${can?'green':'ghost'} sm" ${can?'':'disabled'} onclick="redeemReward('${r.id}',event)">兌換</button>
      <button class="btn ghost sm" onclick="editReward('${r.id}')">✏️</button>
      <button class="btn ghost sm" onclick="delReward('${r.id}')">🗑️</button>
    </div>`;
  }).join('') : '<div class="empty"><div class="e">🎁</div>還沒有獎勵，在下面新增一個吧</div>';

  const log = cd.redeemLog.slice(-5).reverse().map(l =>
    `<div class="row-between" style="font-size:.85rem;padding:4px 2px">
      <span>${esc(l.name)}</span><span class="muted">${l.date} · ⭐${l.cost}</span>
    </div>`).join('');

  $app.innerHTML = `
    ${topbar('星星兌換')}
    <div class="card center" style="background:linear-gradient(135deg,#FFD93D,#FF9F45);color:#5a4500">
      <div style="font-size:.9rem;font-weight:800">${esc(child().name)} 目前有</div>
      <div style="font-size:2.4rem;font-weight:900">⭐ ${stars}</div>
      <div style="font-size:.8rem;font-weight:700;opacity:.8">累積賺得 ${(state.earned&&state.earned[state.activeChild])||0} 顆</div>
    </div>
    <div class="card">${achievementsHTML()}</div>
    <div class="section-title">可兌換的獎勵</div>
    ${list}
    <div class="section-title">自己加獎勵</div>
    <div class="card">
      <div class="voice-field"><input type="text" id="rw-name" placeholder="獎勵名稱，例如：看卡通 30 分鐘" maxlength="20" />${micBtn('rw-name')}</div>
      <div class="gap8"></div>
      <div class="row-between">
        <input type="number" id="rw-cost" placeholder="需要幾顆星" min="1" style="flex:1" />
        <button class="btn accent" onclick="addReward()">＋ 新增</button>
      </div>
    </div>
    ${log ? `<div class="section-title">最近兌換</div><div class="card">${log}</div>` : ''}
  `;
}
function redeemReward(id, ev) {
  if (blockedByLock()) return;
  const r = ensureRewards().find(x => x.id === id);
  if (!r) return;
  const stars = state.stars[state.activeChild] || 0;
  if (stars < r.cost) return;
  if (!confirm(`用 ${r.cost} 顆星星兌換「${r.name}」嗎？`)) return;
  state.stars[state.activeChild] = stars - r.cost;
  cdata().redeemLog.push({ name: r.name, cost: r.cost, date: todayStr() });
  save();
  if (ev) flyStars(ev, 3);
  celebrate();
  modal(`<div class="big">${r.emoji || '🎁'}</div><h2>兌換成功！</h2>
    <p class="muted">「${esc(r.name)}」<br>剩下 ⭐ ${state.stars[state.activeChild]} 顆</p>
    <button class="btn block green" onclick="this.closest('.modal-mask').remove()">耶！</button>`);
  renderRewards();
}
function addReward() {
  const name = (document.getElementById('rw-name').value || '').trim();
  const cost = parseInt(document.getElementById('rw-cost').value, 10);
  if (!name || !cost || cost < 1) { alert('請輸入獎勵名稱和需要的星星數'); return; }
  ensureRewards().push({ id: uid(), name, cost, emoji: '🎁' });
  bumpShared(); save(); renderRewards();
}
function editReward(id) {
  const r = ensureRewards().find(x => x.id === id);
  if (!r) return;
  modal(`
    <h2>編輯獎勵</h2>
    <div style="text-align:left">
      <div class="field-label">名稱</div>
      <div class="voice-field"><input type="text" id="er-name" value="${esc(r.name)}" maxlength="20" />${micBtn('er-name')}</div>
      <div class="field-label">需要幾顆星</div>
      <input type="number" id="er-cost" value="${r.cost}" min="1" />
    </div>
    <div class="gap8"></div>
    <button class="btn block green" onclick="saveReward('${id}')">儲存</button>
    <div class="gap8"></div>
    <button class="btn block ghost" onclick="this.closest('.modal-mask').remove()">取消</button>
  `);
}
function saveReward(id) {
  const r = ensureRewards().find(x => x.id === id);
  const name = (document.getElementById('er-name').value || '').trim();
  const cost = parseInt(document.getElementById('er-cost').value, 10);
  if (!name || !cost || cost < 1) { alert('請輸入名稱和星星數'); return; }
  r.name = name; r.cost = cost;
  bumpShared(); save();
  document.querySelector('.modal-mask')?.remove();
  renderRewards();
}
function delReward(id) {
  if (!confirm('刪除這個獎勵？')) return;
  state.rewards = ensureRewards().filter(r => r.id !== id);
  bumpShared(); save(); renderRewards();
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

  // 最近 7 天摘要（精神 / 心情 / 活動量 點陣）
  const dates = lastNDates(7).reverse();
  const COLORS = {
    spirit:   { '好':'#6BCB77', '普通':'#FFD93D', '很累':'#FFB4B4' },
    mood:     { '開心':'#6BCB77', '普通':'#FFD93D', '煩躁':'#FF9F45' },
    appetite: { '好':'#6BCB77', '普通':'#FFD93D', '差':'#FFB4B4' },
    sleep:    { '好':'#6BCB77', '普通':'#FFD93D', '不好':'#FFB4B4' },
    activity: { '不足':'#FFB4B4', '剛好':'#6BCB77', '太多':'#FF9F45' },
  };
  const headRow = `<div class="wg-row"><span class="wg-lab"></span>${
    dates.map(d => {
      const wd = ['日','一','二','三','四','五','六'][new Date(d+'T00:00:00').getDay()];
      return `<span class="wg-cell ${d===today?'today':''}">${wd}</span>`;
    }).join('')}</div>`;
  const fieldRow = (key, emoji) => `<div class="wg-row">
    <span class="wg-lab">${emoji}</span>${
      dates.map(d => {
        const v = cd.status[d] && cd.status[d][key];
        const col = v ? COLORS[key][v] : '#ececec';
        return `<span class="wg-cell"><span class="wg-dot" title="${v||'—'}" style="background:${col}"></span></span>`;
      }).join('')}</div>`;
  const weekgrid = `<div class="weekgrid">
    ${headRow}
    ${fieldRow('spirit','⚡')}
    ${fieldRow('mood','😊')}
    ${fieldRow('appetite','🍽️')}
    ${fieldRow('sleep','😴')}
    ${fieldRow('activity','🏃')}
  </div>`;

  const { adviceText } = buildSummary(cd);

  $app.innerHTML = `
    ${topbar('今日狀態紀錄')}
    <div class="card">
      <strong>記錄 ${esc(child().name)} 的今天</strong>
      <small class="hint" style="display:block;margin:2px 0 6px">花 10 秒，只做生活觀察，不是醫療診斷</small>
      ${fields}
      <div class="status-row">
        <div class="lab row-between">📝 備註 ${micBtn('status-note')}</div>
        <textarea id="status-note" placeholder="今天有什麼想記下來的？" onchange="setStatusNote(this.value)">${esc(cur.note||'')}</textarea>
      </div>
    </div>

    <div class="card">
      <div class="row-between"><strong>最近 7 天摘要</strong><small class="hint">🟢好 🟡普通 🟠多 🔴差/累</small></div>
      <div class="gap8"></div>
      ${weekgrid}
      <div class="advice">💡 ${adviceText}</div>
    </div>
    <button class="btn block ghost" onclick="go('history')">📅 看歷史月曆</button>
  `;
}

/* 歷史月曆 */
let histDate = new Date(); histDate.setDate(1);
function renderHistory() {
  const cd = cdata();
  const y = histDate.getFullYear(), m = histDate.getMonth();
  const moodColor = { '開心':'#6BCB77', '普通':'#FFD93D', '煩躁':'#FF9F45' };
  const actColor = { '不足':'#FFB4B4', '剛好':'#6BCB77', '太多':'#FF9F45' };
  const first = new Date(y, m, 1).getDay();          // 當月 1 號是星期幾
  const daysIn = new Date(y, m + 1, 0).getDate();
  const todayS = todayStr();

  let cells = '';
  for (let i = 0; i < first; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const s = cd.status[ds];
    const active = (cd.activeDays || []).includes(ds);
    const col = s ? (moodColor[s.mood] || actColor[s.activity] || '#cfd2e0') : 'transparent';
    cells += `<div class="cal-cell ${ds===todayS?'today':''}">
      <span class="cal-day">${d}</span>
      <span class="cal-dot" style="background:${col}"></span>
      ${active ? '<span class="cal-flame">🔥</span>' : ''}
    </div>`;
  }

  const recordedDays = Object.keys(cd.status).filter(k => k.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)).length;

  $app.innerHTML = `
    ${topbar('歷史月曆')}
    <div class="card">
      <div class="row-between">
        <button class="btn ghost sm" onclick="histShift(-1)">‹ 上個月</button>
        <strong>${y} 年 ${m+1} 月</strong>
        <button class="btn ghost sm" onclick="histShift(1)">下個月 ›</button>
      </div>
      <div class="gap8"></div>
      <div class="cal-head">${['日','一','二','三','四','五','六'].map(w=>`<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
      <small class="hint" style="display:block;margin-top:10px">圓點＝當天心情/活動量　🔥＝有完成任務　本月已記錄 ${recordedDays} 天</small>
    </div>
    <button class="btn block ghost" onclick="go('status')">‹ 回狀態紀錄</button>
  `;
}
function histShift(n) {
  histDate.setMonth(histDate.getMonth() + n);
  renderHistory();
}

function ensureToday() {
  const cd = cdata(); const t = todayStr();
  if (!cd.status[t]) cd.status[t] = {};
  return cd.status[t];
}
function setStatus(key, val) {
  if (blockedByLock()) return;
  const s = ensureToday();
  s[key] = (s[key]===val) ? undefined : val;
  save(); renderStatus();
}
function setStatusNote(v) { ensureToday().note = v; save(); }

/* ===========================================================
   主 render
   =========================================================== */
const TABS = [
  { r:'home',   i:'🏠', l:'首頁' },
  { r:'energy', i:'⚡', l:'放電' },
  { r:'levels', i:'🏆', l:'闖關' },
  { r:'flows',  i:'📋', l:'流程' },
  { r:'chores', i:'🎡', l:'家事' },
  { r:'status', i:'📝', l:'狀態' },
];
function renderTabbar() {
  const cur = currentRoute();
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.innerHTML = TABS.map(t =>
    `<button class="tab ${cur===t.r?'on':''}" onclick="go('${t.r}')">
      <span class="ti">${t.i}</span><span class="tl">${t.l}</span>
    </button>`).join('');
}

function render() {
  const r = currentRoute();
  if (r !== 'children') pinUnlocked = false;   // 一離開管理頁就重新上鎖
  window.scrollTo(0,0);
  ({
    home: renderHome,
    children: renderChildren,
    energy: renderEnergy,
    levels: renderLevels,
    flows: renderFlows,
    chores: renderChores,
    status: renderStatus,
    rewards: renderRewards,
    history: renderHistory,
  }[r] || renderHome)();
  renderTabbar();
  renderLockBar();
  // 頁面淡入動畫（重新觸發）
  $app.classList.remove('page-in'); void $app.offsetWidth; $app.classList.add('page-in');
}

applyTheme();
render();
autoSyncPull();   // 開啟 App 自動拉雲端最新
lockConnect();    // 連上即時編輯鎖

// PWA 從背景回到前景時也檢查一次（至少間隔 20 秒，避免頻繁）
let lastAutoPull = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (Date.now() - lastAutoPull > 20000) { lastAutoPull = Date.now(); autoSyncPull(); }
    lockConnect();              // 回前景：重連 + 重新取得鎖
  } else {
    lockRelease();              // 進背景：放掉鎖讓別台可用
  }
});
