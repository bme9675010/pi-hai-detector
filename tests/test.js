/**
 * 屁孩特攻隊 — 自動化測試
 *
 * 只測純函式（不依賴 DOM / localStorage / fetch）。
 * 函式從 app.js / weather.js / worker.js 照搬，保持邏輯一致。
 *
 * 執行方式：
 *   node --test tests/test.js
 */

'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

/* ================================================================
   共用工具（來自 app.js）
   ================================================================ */
const dateStr = d =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = () => dateStr(new Date());

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

const sample = (arr, n) => {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a.slice(0, n);
};

function computeStreak(cd) {
  const days = new Set(cd.activeDays || []);
  if (!days.size) return 0;
  let streak = 0;
  const d = new Date();
  if (!days.has(dateStr(d))) d.setDate(d.getDate()-1); // 今天沒做從昨天起算
  while (days.has(dateStr(d))) { streak++; d.setDate(d.getDate()-1); }
  return streak;
}

// 今日往前 n 天的日期字串（輔助用）
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate()-n); return dateStr(d); };

/* awardOnce 核心邏輯（不含 addStars / logStar 等副作用） */
function awardOnce(cd, key, todayDate) {
  if (cd.awarded.date !== todayDate) cd.awarded = { date: todayDate, keys: [] };
  if (cd.awarded.keys.includes(key)) return false;
  cd.awarded.keys.push(key);
  return true;
}

/* ================================================================
   天氣函式（來自 weather.js）
   ================================================================ */
function wmoInfo(code) {
  if (code === 0)                      return { emoji:'☀️',  label:'晴朗' };
  if (code <= 2)                       return { emoji:'🌤️', label:'晴時多雲' };
  if (code === 3)                      return { emoji:'☁️',  label:'多雲' };
  if (code === 45 || code === 48)      return { emoji:'🌫️', label:'起霧' };
  if (code >= 51 && code <= 57)        return { emoji:'🌦️', label:'毛毛雨' };
  if (code >= 61 && code <= 67)        return { emoji:'🌧️', label:'下雨' };
  if (code >= 71 && code <= 77)        return { emoji:'❄️',  label:'下雪' };
  if (code >= 80 && code <= 82)        return { emoji:'🌧️', label:'陣雨' };
  if (code >= 85 && code <= 86)        return { emoji:'🌨️', label:'陣雪' };
  if (code >= 95)                      return { emoji:'⛈️', label:'雷雨' };
  return { emoji:'🌡️', label:'—' };
}

function cwaEmoji(s) {
  s = s || '';
  if (/雷/.test(s))                    return '⛈️';
  if (/雪/.test(s))                    return '❄️';
  if (/雨/.test(s))                    return '🌧️';
  if (/霧/.test(s))                    return '🌫️';
  if (/晴.*多雲|多雲.*晴/.test(s))     return '🌤️';
  if (/陰/.test(s))                    return '☁️';
  if (/多雲/.test(s))                  return '⛅';
  if (/晴/.test(s))                    return '☀️';
  return '🌡️';
}

function weatherAdvice(w) {
  const t = w.temp;
  let rain = w.isRain, snow = w.isSnow;
  if (rain === undefined && typeof w.code === 'number') {
    const c = w.code;
    rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
    snow = (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  }
  if (rain) return { place:'indoor',  note:'外面在下雨，建議室內放電 ☔' };
  if (snow) return { place:'indoor',  note:'外面在下雪，建議室內暖暖身 ☃️' };
  if (t >= 33)           return { place:'indoor',  note:'天氣很熱，建議室內或緩和動作，記得多喝水 💧' };
  if (t != null && t <= 10) return { place:'indoor', note:'天氣很冷，建議室內活動先暖身 🧣' };
  return { place:'outdoor', note:'天氣不錯，很適合到戶外放電 🌳' };
}

/* ================================================================
   Worker 工具函式（來自 worker/worker.js）
   ================================================================ */
function normCity(s) { return String(s || '').replace(/台/g, '臺').trim(); }

function pickNow(loc, elName) {
  const el = (loc.WeatherElement || []).find(e => e.ElementName === elName);
  if (!el || !el.Time || !el.Time.length) return null;
  const now = Date.now();
  let pick = el.Time[0];
  for (const t of el.Time) {
    const st = Date.parse(t.StartTime || t.DataTime);
    const en = Date.parse(t.EndTime   || t.StartTime || t.DataTime);
    if (st <= now && (!en || now < en)) { pick = t; break; }
  }
  return pick.ElementValue && pick.ElementValue[0];
}

/* 學習任務排程（來自 app.js 模組 6） */
function studyTasksForToday(tasks, today) {
  const dow = new Date(today + 'T00:00:00').getDay();
  return (tasks || []).filter(t => {
    if (t.repeat === 'weekly') return Array.isArray(t.days) && t.days.includes(dow);
    if (t.repeat === 'once')   return !!t.due && t.due >= today;
    return true;
  });
}
function dueLabel(n) {
  if (n === null) return '';
  if (n < 0)   return '已過期';
  if (n === 0) return '就是今天';
  if (n === 1) return '明天';
  return `還有 ${n} 天`;
}

/* 家事照片逐張合併（來自 worker/worker.js mergePhotos） */
function mergePhotos(aData, bData) {
  if (!aData && !bData) return null;
  const tOf = v => (v && typeof v === 'object' && v.t) || 0;
  const keep = {};
  for (const src of [aData, bData]) {
    const m = (src && src.chorePhotos) || {};
    for (const k in m) {
      if (!(k in keep) || tOf(m[k]) >= tOf(keep[k])) keep[k] = m[k];
    }
  }
  const del = {};
  for (const src of [aData, bData]) {
    const m = (src && src.chorePhotosDel) || {};
    for (const k in m) del[k] = Math.max(del[k] || 0, m[k] || 0);
  }
  for (const k in del) {
    if (k in keep && del[k] > tOf(keep[k])) delete keep[k];
  }
  return { keep, del };
}

/* 雲端合併邏輯（來自 worker/worker.js /sync/merge 路由） */
function mergeCloudDoc(stored, inc) {
  if (!stored.children) stored.children = {};
  if (!stored.shared)   stored.shared   = { rewards:[], customChores:[], customActions:[], t:0 };
  if (!stored.deleted)  stored.deleted  = {};

  const inC = inc.children || {};
  for (const cid in inC) {
    const mine = inC[cid], theirs = stored.children[cid];
    const photos = mergePhotos(theirs && theirs.data, mine && mine.data);
    if (!theirs || (mine.t || 0) >= (theirs.t || 0)) stored.children[cid] = mine;
    const win = stored.children[cid];
    if (win && win.data && photos) { win.data.chorePhotos = photos.keep; win.data.chorePhotosDel = photos.del; }
  }
  if (inc.shared && (inc.shared.t || 0) > (stored.shared.t || 0))
    stored.shared = inc.shared;

  const inD = inc.deleted || {};
  for (const cid in inD) stored.deleted[cid] = Math.max(stored.deleted[cid] || 0, inD[cid]);
  for (const cid in stored.deleted) {
    if (stored.children[cid] && stored.deleted[cid] >= (stored.children[cid].t || 0))
      delete stored.children[cid];
  }
  return stored;
}

/* ================================================================
   測試案例
   ================================================================ */

/* ---------- dateStr ---------- */
describe('dateStr', () => {
  test('格式正確（月/日補零）', () => {
    assert.equal(dateStr(new Date(2026, 5, 26)), '2026-06-26');
    assert.equal(dateStr(new Date(2026, 0,  5)), '2026-01-05');
    assert.equal(dateStr(new Date(2026, 11, 31)), '2026-12-31');
  });
});

/* ---------- esc ---------- */
describe('esc', () => {
  test('跳脫 HTML 特殊字元', () => {
    assert.equal(esc('<script>'), '&lt;script&gt;');
    assert.equal(esc('"hello"'), '&quot;hello&quot;');
    assert.equal(esc('a & b'), 'a &amp; b');
  });
  test('安全字串不變', () => assert.equal(esc('hello 你好'), 'hello 你好'));
  test('非字串轉成字串再跳脫', () => {
    assert.equal(esc(42), '42');
    assert.equal(esc(null), 'null');
  });
});

/* ---------- sample ---------- */
describe('sample', () => {
  test('回傳 n 個元素', () => {
    assert.equal(sample([1,2,3,4,5], 3).length, 3);
  });
  test('n > 陣列長度時回傳全部', () => {
    assert.equal(sample([1,2], 10).length, 2);
  });
  test('不修改原陣列', () => {
    const arr = [1,2,3];
    sample(arr, 2);
    assert.deepEqual(arr, [1,2,3]);
  });
  test('回傳值都來自原陣列', () => {
    const arr = [10,20,30,40,50];
    sample(arr, 4).forEach(v => assert.ok(arr.includes(v)));
  });
  test('不重複', () => {
    const arr = Array.from({length:20}, (_,i) => i);
    const r = sample(arr, 10);
    assert.equal(new Set(r).size, 10);
  });
});

/* ---------- computeStreak ---------- */
describe('computeStreak', () => {
  test('空陣列 → 0', () => {
    assert.equal(computeStreak({ activeDays:[] }), 0);
    assert.equal(computeStreak({}), 0);
  });
  test('只有今天 → 1', () => {
    assert.equal(computeStreak({ activeDays:[todayStr()] }), 1);
  });
  test('只有昨天（今天還沒做）→ 1（仍算連線）', () => {
    assert.equal(computeStreak({ activeDays:[daysAgo(1)] }), 1);
  });
  test('連續 3 天含今天 → 3', () => {
    assert.equal(computeStreak({ activeDays:[daysAgo(2), daysAgo(1), todayStr()] }), 3);
  });
  test('中間有空缺只算最近段', () => {
    // 今天 + 3 天前（中間 1,2 天沒做）→ 只算今天 = 1
    assert.equal(computeStreak({ activeDays:[daysAgo(3), todayStr()] }), 1);
  });
  test('從昨天開始連續 4 天', () => {
    const days = [daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1)];
    assert.equal(computeStreak({ activeDays:days }), 4);
  });
  test('未來日期不影響（往回數，不往前看）', () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    assert.equal(computeStreak({ activeDays:[dateStr(tomorrow), todayStr()] }), 1);
  });
});

/* ---------- awardOnce ---------- */
describe('awardOnce', () => {
  const today    = '2026-06-26';
  const tomorrow = '2026-06-27';

  test('首次領取成功', () => {
    const cd = { awarded:{ date:'', keys:[] } };
    assert.ok(awardOnce(cd, 'energy', today));
    assert.ok(cd.awarded.keys.includes('energy'));
  });
  test('同天同任務第二次被拒', () => {
    const cd = { awarded:{ date:today, keys:['energy'] } };
    assert.equal(awardOnce(cd, 'energy', today), false);
  });
  test('同天不同任務可以領', () => {
    const cd = { awarded:{ date:today, keys:['energy'] } };
    assert.ok(awardOnce(cd, 'flow:morning', today));
  });
  test('跨日重置：隔天同任務可再領', () => {
    const cd = { awarded:{ date:today, keys:['energy'] } };
    assert.ok(awardOnce(cd, 'energy', tomorrow));
    assert.equal(cd.awarded.date, tomorrow);
    assert.equal(cd.awarded.keys.length, 1); // 舊 keys 清空
  });
  test('同天多個不同任務全部可領', () => {
    const cd = { awarded:{ date:'', keys:[] } };
    assert.ok(awardOnce(cd, 'energy',       today));
    assert.ok(awardOnce(cd, 'flow:morning', today));
    assert.ok(awardOnce(cd, 'flow:night',   today));
    assert.equal(cd.awarded.keys.length, 3);
  });
  test('chore 任務 id 各自獨立', () => {
    const cd = { awarded:{ date:today, keys:['chore:c1'] } };
    assert.equal(awardOnce(cd, 'chore:c1', today), false);  // 同家事 → 拒
    assert.ok(awardOnce(cd, 'chore:c2', today));             // 不同家事 → 允許
  });
});

/* ---------- wmoInfo ---------- */
describe('wmoInfo', () => {
  test('0 → 晴朗', () => {
    assert.equal(wmoInfo(0).label, '晴朗');
    assert.equal(wmoInfo(0).emoji, '☀️');
  });
  test('1-2 → 晴時多雲', () => {
    assert.equal(wmoInfo(1).label, '晴時多雲');
    assert.equal(wmoInfo(2).emoji, '🌤️');
  });
  test('3 → 多雲', ()  => assert.equal(wmoInfo(3).label,  '多雲'));
  test('45/48 → 起霧', () => {
    assert.equal(wmoInfo(45).label, '起霧');
    assert.equal(wmoInfo(48).label, '起霧');
  });
  test('61-67 → 下雨', () => {
    assert.equal(wmoInfo(61).label, '下雨');
    assert.equal(wmoInfo(67).label, '下雨');
  });
  test('80-82 → 陣雨', () => assert.equal(wmoInfo(80).label, '陣雨'));
  test('71-77 → 下雪', () => assert.equal(wmoInfo(71).label, '下雪'));
  test('>=95 → 雷雨', () => {
    assert.equal(wmoInfo(95).label, '雷雨');
    assert.equal(wmoInfo(99).label, '雷雨');
  });
});

/* ---------- cwaEmoji ---------- */
describe('cwaEmoji', () => {
  const cases = [
    ['晴天',    '☀️'],
    ['多雲',    '⛅'],
    ['晴時多雲','🌤️'],
    ['多雲時晴','🌤️'],
    ['陰天',    '☁️'],
    ['陣雨',    '🌧️'],
    ['雷陣雨',  '⛈️'],    // 雷 優先於 雨
    ['下雪',    '❄️'],
    ['起霧',    '🌫️'],
    ['',        '🌡️'],
  ];
  cases.forEach(([input, expected]) => {
    test(`'${input}' → ${expected}`, () => assert.equal(cwaEmoji(input), expected));
  });
  test('null → 🌡️（fallback）', () => assert.equal(cwaEmoji(null), '🌡️'));
});

/* ---------- weatherAdvice ---------- */
describe('weatherAdvice', () => {
  test('isRain → indoor', () => {
    assert.equal(weatherAdvice({ isRain:true, temp:25 }).place, 'indoor');
  });
  test('isSnow → indoor', () => {
    assert.equal(weatherAdvice({ isSnow:true, temp:0 }).place, 'indoor');
  });
  test('≥ 33° → indoor（炎熱）', () => {
    assert.equal(weatherAdvice({ temp:33 }).place, 'indoor');
    assert.ok(weatherAdvice({ temp:35 }).note.includes('熱'));
  });
  test('≤ 10° → indoor（寒冷）', () => {
    assert.equal(weatherAdvice({ temp:10 }).place, 'indoor');
    assert.ok(weatherAdvice({ temp:5  }).note.includes('冷'));
  });
  test('舒適溫度 → outdoor', () => {
    assert.equal(weatherAdvice({ temp:25 }).place, 'outdoor');
    assert.equal(weatherAdvice({ temp:22 }).place, 'outdoor');
  });
  test('WMO 雨碼 → indoor', () => {
    assert.equal(weatherAdvice({ code:61, temp:20 }).place, 'indoor');
    assert.equal(weatherAdvice({ code:80, temp:25 }).place, 'indoor');
    assert.equal(weatherAdvice({ code:95, temp:28 }).place, 'indoor');
  });
  test('WMO 雪碼 → indoor', () => {
    assert.equal(weatherAdvice({ code:71, temp:0 }).place, 'indoor');
  });
  test('temp 為 null 且無雨雪 → outdoor（不誤判冷熱）', () => {
    assert.equal(weatherAdvice({ temp:null }).place, 'outdoor');
  });
  test('11-32° 無雨 → outdoor', () => {
    [11, 20, 25, 32].forEach(t =>
      assert.equal(weatherAdvice({ temp:t }).place, 'outdoor'));
  });
});

/* ---------- normCity ---------- */
describe('normCity', () => {
  test('台 → 臺', () => {
    assert.equal(normCity('台北市'), '臺北市');
    assert.equal(normCity('台南市'), '臺南市');
    assert.equal(normCity('台中市'), '臺中市');
  });
  test('已是臺 → 不變', () => {
    assert.equal(normCity('臺東縣'), '臺東縣');
  });
  test('前後空格去除', () => {
    assert.equal(normCity('  台北市 '), '臺北市');
  });
  test('null / undefined → 空字串', () => {
    assert.equal(normCity(null), '');
    assert.equal(normCity(undefined), '');
  });
  test('不含台的字串不變', () => {
    assert.equal(normCity('新北市'), '新北市');
  });
});

/* ---------- pickNow ---------- */
describe('pickNow', () => {
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();

  const makeEl = (name, times) => ({ WeatherElement:[{ ElementName:name, Time:times }] });

  test('找到包含現在時間的區間', () => {
    const loc = makeEl('天氣現象', [
      { StartTime:iso(now-3600000), EndTime:iso(now+3600000), ElementValue:[{ value:'多雲' }] },
      { StartTime:iso(now+3600000), EndTime:iso(now+7200000), ElementValue:[{ value:'晴天' }] },
    ]);
    assert.equal(pickNow(loc, '天氣現象').value, '多雲');
  });
  test('沒有符合時段回傳第一筆', () => {
    const loc = makeEl('天氣現象', [
      { StartTime:iso(now+3600000), EndTime:iso(now+7200000), ElementValue:[{ value:'未來' }] },
    ]);
    assert.equal(pickNow(loc, '天氣現象').value, '未來');
  });
  test('找不到元素 → null', () => {
    assert.equal(pickNow({ WeatherElement:[] }, '不存在'), null);
    assert.equal(pickNow({}, '不存在'), null);
  });
  test('Time 為空陣列 → null', () => {
    const loc = { WeatherElement:[{ ElementName:'x', Time:[] }] };
    assert.equal(pickNow(loc, 'x'), null);
  });
});

/* ---------- mergeCloudDoc ---------- */
describe('mergeCloudDoc（雲端合併）', () => {
  const fresh = () => ({ children:{}, shared:{ t:0, rewards:[], customChores:[], customActions:[] }, deleted:{} });

  test('較新的子資料覆蓋較舊的', () => {
    const stored = { ...fresh(), children:{ c1:{ t:100, stars:5 } } };
    const result = mergeCloudDoc(stored, { children:{ c1:{ t:200, stars:10 } }, shared:{ t:0 }, deleted:{} });
    assert.equal(result.children.c1.stars, 10);
  });
  test('較舊的傳入資料輸給本機', () => {
    const stored = { ...fresh(), children:{ c1:{ t:200, stars:10 } } };
    const result = mergeCloudDoc(stored, { children:{ c1:{ t:100, stars:5  } }, shared:{ t:0 }, deleted:{} });
    assert.equal(result.children.c1.stars, 10);
  });
  test('時間戳相同：傳入者勝（>= 條件）', () => {
    const stored = { ...fresh(), children:{ c1:{ t:100, stars:3 } } };
    const result = mergeCloudDoc(stored, { children:{ c1:{ t:100, stars:7  } }, shared:{ t:0 }, deleted:{} });
    assert.equal(result.children.c1.stars, 7);
  });
  test('兩端不同小孩合併後都保留', () => {
    const stored = { ...fresh(), children:{ alice:{ t:100 } } };
    const result = mergeCloudDoc(stored, { children:{ bob:{ t:50 } }, shared:{ t:0 }, deleted:{} });
    assert.ok(result.children.alice);
    assert.ok(result.children.bob);
  });
  test('較新的共用設定覆蓋', () => {
    const stored = { ...fresh(), shared:{ t:50, rewards:['old'] } };
    const result = mergeCloudDoc(stored, { children:{}, shared:{ t:100, rewards:['new'] }, deleted:{} });
    assert.deepEqual(result.shared.rewards, ['new']);
  });
  test('較舊的共用設定輸給本機', () => {
    const stored = { ...fresh(), shared:{ t:100, rewards:['current'] } };
    const result = mergeCloudDoc(stored, { children:{}, shared:{ t:50, rewards:['old'] }, deleted:{} });
    assert.deepEqual(result.shared.rewards, ['current']);
  });
  test('刪除墓碑傳播：child 被移除', () => {
    const stored = { ...fresh(), children:{ c1:{ t:100 } } };
    const result = mergeCloudDoc(stored, { children:{}, shared:{ t:0 }, deleted:{ c1:200 } });
    assert.equal(result.children.c1, undefined);
    assert.equal(result.deleted.c1, 200);
  });
  test('刪除時間 < child 更新時間：不刪', () => {
    // child 在刪除後又更新了（t=300 > deleted=100），應保留
    const stored = { ...fresh(), children:{ c1:{ t:300 } } };
    const result = mergeCloudDoc(stored, { children:{}, shared:{ t:0 }, deleted:{ c1:100 } });
    assert.ok(result.children.c1);
  });
  test('空傳入不影響本機資料', () => {
    const stored = { ...fresh(), children:{ c1:{ t:100, stars:5 } } };
    const result = mergeCloudDoc(stored, { children:{}, shared:{ t:0 }, deleted:{} });
    assert.equal(result.children.c1.stars, 5);
  });
});

/* ---------- mergePhotos（家事照片跨裝置合併） ---------- */
describe('mergePhotos（家事照片合併）', () => {
  const P = (url, t) => ({ url, t });

  test('兩台裝置各拍不同家事 → 兩張都保留', () => {
    const mom = { chorePhotos: { 'c1:2026-08-28': P('u1', 100) } };
    const dad = { chorePhotos: { 'c2:2026-08-28': P('u2', 200) } };
    const r = mergePhotos(mom, dad);
    assert.equal(r.keep['c1:2026-08-28'].url, 'u1');
    assert.equal(r.keep['c2:2026-08-28'].url, 'u2');
  });

  test('時間戳較舊的那台不會洗掉對方的照片（原始 bug）', () => {
    // 媽媽先拍(t=100)，爸爸後拍(t=200)但沒先拉資料 → 合併後兩張都要在
    const cloud = { children: { kid: { t: 100, data: { chorePhotos: { 'c1:2026-08-28': P('mom', 100) } } } },
                    shared: { t: 0 }, deleted: {} };
    const inc   = { children: { kid: { t: 200, data: { chorePhotos: { 'c2:2026-08-28': P('dad', 200) } } } },
                    shared: { t: 0 }, deleted: {} };
    const r = mergeCloudDoc(cloud, inc);
    const photos = r.children.kid.data.chorePhotos;
    assert.equal(photos['c1:2026-08-28'].url, 'mom', '媽媽的照片不該消失');
    assert.equal(photos['c2:2026-08-28'].url, 'dad');
  });

  test('同一張照片重拍 → 較新的勝出', () => {
    const a = { chorePhotos: { 'c1:2026-08-28': P('old', 100) } };
    const b = { chorePhotos: { 'c1:2026-08-28': P('new', 300) } };
    assert.equal(mergePhotos(a, b).keep['c1:2026-08-28'].url, 'new');
    assert.equal(mergePhotos(b, a).keep['c1:2026-08-28'].url, 'new', '合併順序不影響結果');
  });

  test('刪除墓碑比照片新 → 該張被移除', () => {
    const a = { chorePhotos: { 'c1:2026-08-28': P('u1', 100) } };
    const b = { chorePhotosDel: { 'c1:2026-08-28': 200 } };
    assert.equal(mergePhotos(a, b).keep['c1:2026-08-28'], undefined);
  });

  test('刪除後重拍 → 照片復活（照片比墓碑新）', () => {
    const a = { chorePhotos: { 'c1:2026-08-28': P('retake', 300) } };
    const b = { chorePhotosDel: { 'c1:2026-08-28': 200 } };
    assert.equal(mergePhotos(a, b).keep['c1:2026-08-28'].url, 'retake');
  });

  test('墓碑取兩邊最大值', () => {
    const a = { chorePhotosDel: { 'c1:2026-08-28': 100 } };
    const b = { chorePhotosDel: { 'c1:2026-08-28': 500 } };
    assert.equal(mergePhotos(a, b).del['c1:2026-08-28'], 500);
  });

  test('相容舊格式（純字串 URL，視為 t=0）', () => {
    const a = { chorePhotos: { 'c1:2026-08-28': 'legacy-url' } };
    const b = { chorePhotos: { 'c2:2026-08-28': P('new', 100) } };
    const r = mergePhotos(a, b);
    assert.equal(r.keep['c1:2026-08-28'], 'legacy-url');
    assert.equal(r.keep['c2:2026-08-28'].url, 'new');
  });

  test('舊格式字串會被有時間戳的新照片取代', () => {
    const a = { chorePhotos: { 'c1:2026-08-28': 'legacy' } };
    const b = { chorePhotos: { 'c1:2026-08-28': P('fresh', 1) } };
    assert.equal(mergePhotos(a, b).keep['c1:2026-08-28'].url, 'fresh');
  });

  test('兩邊皆空 → null', () => {
    assert.equal(mergePhotos(null, null), null);
  });

  test('單邊有資料也能合併', () => {
    const r = mergePhotos(null, { chorePhotos: { 'c1:2026-08-28': P('only', 1) } });
    assert.equal(r.keep['c1:2026-08-28'].url, 'only');
  });
});

/* ---------- 照片上傳 key 驗證（來自 worker /photo/upload） ---------- */
describe('照片 key 格式驗證', () => {
  const ok = k => /^[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,40}\/\d{4}-\d{2}-\d{2}$/.test(k);

  test('正常的 childId/choreId/日期 通過', () => {
    assert.ok(ok('abc1234/d0/2026-08-28'));
    assert.ok(ok('x7y8z9a/kf83jd2/2026-12-31'));
  });
  test('內建家事 id（d0、d12）通過', () => {
    assert.ok(ok('abc1234/d12/2026-08-28'));
  });
  test('路徑穿越被擋下', () => {
    assert.ok(!ok('../../etc/passwd'));
    assert.ok(!ok('a/../b/2026-08-28'));
  });
  test('多餘的路徑層級被擋下', () => {
    assert.ok(!ok('a/b/c/2026-08-28'));
    assert.ok(!ok('a/2026-08-28'));
  });
  test('日期格式錯誤被擋下', () => {
    assert.ok(!ok('abc/d0/2026-8-28'));
    assert.ok(!ok('abc/d0/not-a-date'));
    assert.ok(!ok('abc/d0/'));
  });
  test('超長 id 被擋下', () => {
    assert.ok(!ok('a'.repeat(41) + '/d0/2026-08-28'));
  });
  test('特殊字元被擋下', () => {
    assert.ok(!ok('abc$/d0/2026-08-28'));
    assert.ok(!ok('abc/d 0/2026-08-28'));
  });
});

/* ---------- studyTasksForToday / daysUntil（學習任務週期） ---------- */
describe('studyTasksForToday（學習任務排程）', () => {
  // 2026-09-14 是星期一，2026-09-18 是星期五
  const MON = '2026-09-14', TUE = '2026-09-15', FRI = '2026-09-18', SUN = '2026-09-20';
  const daily  = { id:'a', repeat:'daily' };
  const monWed = { id:'b', repeat:'weekly', days:[1,3] };
  const friday = { id:'c', repeat:'weekly', days:[5] };
  const exam   = { id:'d', repeat:'once', due:'2026-09-25' };
  const all = [daily, monWed, friday, exam];
  const ids = (tasks, day) => studyTasksForToday(tasks, day).map(t => t.id);

  test('daily 每天都出現', () => {
    [MON, TUE, FRI, SUN].forEach(d => assert.ok(ids(all, d).includes('a'), d));
  });
  test('weekly 只在指定星期出現', () => {
    assert.ok(ids(all, MON).includes('b'), '週一該有');
    assert.ok(!ids(all, TUE).includes('b'), '週二不該有');
    assert.ok(ids(all, FRI).includes('c'), '週五該有');
    assert.ok(!ids(all, MON).includes('c'), '週一不該有週五的');
  });
  test('星期日 = 0 的邊界正確', () => {
    const sunTask = { id:'s', repeat:'weekly', days:[0] };
    assert.deepEqual(ids([sunTask], SUN), ['s']);
    assert.deepEqual(ids([sunTask], MON), []);
  });
  test('once 未到期會出現', () => {
    assert.ok(ids(all, MON).includes('d'));
  });
  test('once 當天仍會出現', () => {
    assert.ok(ids([exam], '2026-09-25').includes('d'));
  });
  test('once 過期後消失', () => {
    assert.ok(!ids([exam], '2026-09-26').includes('d'));
  });
  test('once 沒填日期不出現', () => {
    assert.deepEqual(ids([{ id:'x', repeat:'once', due:'' }], MON), []);
  });
  test('weekly 沒填星期不出現', () => {
    assert.deepEqual(ids([{ id:'y', repeat:'weekly' }], MON), []);
    assert.deepEqual(ids([{ id:'y', repeat:'weekly', days:[] }], MON), []);
  });
  test('沒填 repeat 的舊資料當成每天', () => {
    assert.deepEqual(ids([{ id:'old' }], MON), ['old']);
  });
  test('空題庫回傳空陣列', () => {
    assert.deepEqual(studyTasksForToday([], MON), []);
    assert.deepEqual(studyTasksForToday(null, MON), []);
  });
  test('多個星期的任務在每一天都正確', () => {
    const t = { id:'m', repeat:'weekly', days:[2,4] };   // 二、四
    assert.deepEqual(ids([t], '2026-09-15'), ['m']);      // 二
    assert.deepEqual(ids([t], '2026-09-16'), []);         // 三
    assert.deepEqual(ids([t], '2026-09-17'), ['m']);      // 四
  });
});

describe('dueLabel（倒數文字）', () => {
  test('各種天數的說法', () => {
    assert.equal(dueLabel(0), '就是今天');
    assert.equal(dueLabel(1), '明天');
    assert.equal(dueLabel(5), '還有 5 天');
    assert.equal(dueLabel(-1), '已過期');
    assert.equal(dueLabel(null), '');
  });
});
