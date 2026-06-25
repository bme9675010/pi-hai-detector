/* ===========================================================
   屁孩特攻隊 — AI 生成代理 (Cloudflare Worker)
   key 存在 Cloudflare secret，前端只呼叫這支，不會外洩
   主：MiniMax，失敗自動退回 DeepSeek
   =========================================================== */

const SYS = '你是兒童運動與生活任務設計助手。只產生「安全、適齡、適合在家/客廳/公園」的內容，'
  + '避免任何危險動作（倒立、攀高、從高處跳下、激烈碰撞、需要他人保護或器材的動作）。'
  + '一律使用繁體中文。嚴格「只輸出 JSON 陣列」，不要任何說明文字、不要程式碼框。';

// CWA 鄉鎮天氣預報（未來2天）各縣市 dataset id
const CWA_MAP = {
  '宜蘭縣':'F-D0047-001','桃園市':'F-D0047-005','新竹縣':'F-D0047-009','苗栗縣':'F-D0047-013',
  '彰化縣':'F-D0047-017','南投縣':'F-D0047-021','雲林縣':'F-D0047-025','嘉義縣':'F-D0047-029',
  '屏東縣':'F-D0047-033','臺東縣':'F-D0047-037','花蓮縣':'F-D0047-041','澎湖縣':'F-D0047-045',
  '基隆市':'F-D0047-049','新竹市':'F-D0047-053','嘉義市':'F-D0047-057','臺北市':'F-D0047-061',
  '高雄市':'F-D0047-065','新北市':'F-D0047-069','臺中市':'F-D0047-073','臺南市':'F-D0047-077',
  '連江縣':'F-D0047-081','金門縣':'F-D0047-085',
};
function normCity(s) { return String(s || '').replace(/台/g, '臺').trim(); }
// 取「現在所在時段」的天氣元素值
function pickNow(loc, elName) {
  const el = (loc.WeatherElement || []).find(e => e.ElementName === elName);
  if (!el || !el.Time || !el.Time.length) return null;
  const now = Date.now();
  let pick = el.Time[0];
  for (const t of el.Time) {
    const st = Date.parse(t.StartTime || t.DataTime);
    const en = Date.parse(t.EndTime || t.StartTime || t.DataTime);
    if (st <= now && (!en || now < en)) { pick = t; break; }
  }
  return pick.ElementValue && pick.ElementValue[0];
}

export default {
  async scheduled(event, env, ctx) {
    // 每 10 分鐘 ping Render 伺服器，防止冷啟動
    ctx.waitUntil(Promise.all([
      fetch('https://parking-spot-pwa.onrender.com/api/health').catch(() => {}),
      fetch('https://ai-tutor-mnfg.onrender.com/api/summary').catch(() => {}),
    ]));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    // push 端點（App → Worker）開放所有來源；AI 生成端點維持 ALLOWED_ORIGIN 限制
    const isPushPath = ['/depart/save', '/chores/save', '/exercise/save'].includes(url.pathname);
    const cors = {
      'Access-Control-Allow-Origin': isPushPath ? '*' : (env.ALLOWED_ORIGIN || '*'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const allowed = env.ALLOWED_ORIGIN || '';
    const origin = request.headers.get('Origin');
    const originOk = !(allowed && allowed !== '*' && origin !== allowed);

    // ---- 即時編輯鎖：WebSocket → Durable Object（一個同步碼一間房）----
    if (url.pathname === '/room') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      if (!originOk) return new Response('forbidden', { status: 403 });
      if (!env.ROOM) return new Response('DO 未綁定', { status: 500 });
      const code = url.searchParams.get('code') || '';
      if (code.length < 6) return new Response('bad code', { status: 400 });
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      return stub.fetch(request);
    }

    // ---- GET 端點（不需要 body，Portal/Scriptable 可直接呼叫）----
    if (request.method === 'GET') {
      const gPath = url.pathname;
      const getCors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };

      // 家庭總控台：屁孩放電摘要
      if (gPath === '/api/summary') {
        if (!env.SYNC) return json({ app: '屁孩特攻隊', items: [{ text: 'KV 尚未綁定', level: 'info' }] }, 200, getCors);
        const code = String(url.searchParams.get('code') || '').trim();
        if (code.length < 6) return json({ app: '屁孩特攻隊', items: [{ text: '需提供同步碼', level: 'info' }] }, 200, getCors);
        const raw = await env.SYNC.get('m2:' + code);
        if (!raw) return json({ app: '屁孩特攻隊', items: [{ text: '尚無雲端資料', level: 'info' }] }, 200, getCors);
        const stored = JSON.parse(raw);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        const items = [];
        let doneCount = 0, totalChildren = 0;
        for (const [, child] of Object.entries(stored.children || {})) {
          const name = child.profile?.name || '小孩';
          const et = child.data?.energyToday;
          totalChildren++;
          if (et && et.date === today) {
            const done = (et.actions || []).filter(a => a.done).length;
            const total = (et.actions || []).length;
            if (et.rewarded) { items.push({ text: `${name} 今日放電任務完成 ✓`, level: 'ok' }); doneCount++; }
            else items.push({ text: `${name} 放電任務 ${done}/${total} 未全完`, level: 'warn' });
          } else {
            items.push({ text: `${name} 今日放電任務尚未開始`, level: 'warn' });
          }
          const stars = child.stars ?? 0;
          if (stars > 0) items.push({ text: `${name} 目前 ⭐ ${stars} 顆星`, level: 'info' });
        }
        if (items.length === 0) { items.push({ text: '尚無小孩資料', level: 'info' }); }
        // 多個小孩時，最後加一筆總結（折疊時顯示這一筆）
        else if (totalChildren > 1) {
          const level = doneCount === totalChildren ? 'ok' : doneCount > 0 ? 'warn' : 'warn';
          const text = doneCount === totalChildren
            ? `全員 ${totalChildren}/${totalChildren} 完成放電 🎉`
            : `${doneCount}/${totalChildren} 位完成放電任務`;
          items.push({ text, level });
        }
        return json({ app: '屁孩特攻隊', items }, 200, getCors);
      }

      // 家庭總控台：運動小夥伴摘要（Scriptable 寫入，Portal 讀取）
      if (gPath === '/api/exercise') {
        if (!env.SYNC) return json({ app: '運動小夥伴', items: [{ text: 'KV 尚未綁定', level: 'info' }] }, 200, getCors);
        const code = String(url.searchParams.get('code') || '').trim();
        if (code.length < 6) return json({ app: '運動小夥伴', items: [{ text: '需提供同步碼', level: 'info' }] }, 200, getCors);
        const raw = await env.SYNC.get('ex:' + code);
        if (!raw) return json({ app: '運動小夥伴', items: [{ text: '今日尚未記錄運動', level: 'info' }] }, 200, getCors);
        const d = JSON.parse(raw);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        if (d.date !== today) return json({ app: '運動小夥伴', items: [{ text: '今日尚未記錄運動', level: 'info' }] }, 200, getCors);
        const items = d.items || [{ text: d.summary || '已記錄運動資料', level: 'ok' }];
        return json({ app: '運動小夥伴', items }, 200, getCors);
      }

      // 家庭總控台：家事幫手摘要（App 推送，Portal 讀取）
      if (gPath === '/api/chores-summary') {
        if (!env.SYNC) return json({ app: '家事幫手', items: [{ text: 'KV 尚未綁定', level: 'info' }] }, 200, getCors);
        const code = String(url.searchParams.get('code') || '').trim();
        if (code.length < 6) return json({ app: '家事幫手', items: [{ text: '需提供同步碼', level: 'info' }] }, 200, getCors);
        const raw = await env.SYNC.get('chores:' + code);
        if (!raw) return json({ app: '家事幫手', items: [{ text: '今日尚未記錄家事', level: 'info' }] }, 200, getCors);
        const d = JSON.parse(raw);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        if (d.date !== today) return json({ app: '家事幫手', items: [{ text: '今日尚未記錄家事', level: 'info' }] }, 200, getCors);
        return json({ app: '家事幫手', items: d.items || [] }, 200, getCors);
      }

      // 家庭總控台：出發了摘要（App 推送，Portal 讀取）
      if (gPath === '/api/depart-summary') {
        if (!env.SYNC) return json({ app: '出發了', items: [{ text: 'KV 尚未綁定', level: 'info' }] }, 200, getCors);
        const code = String(url.searchParams.get('code') || '').trim();
        if (code.length < 6) return json({ app: '出發了', items: [{ text: '需提供同步碼', level: 'info' }] }, 200, getCors);
        const raw = await env.SYNC.get('depart:' + code);
        if (!raw) return json({ app: '出發了', items: [{ text: '今日尚未使用出發了', level: 'info' }] }, 200, getCors);
        const d = JSON.parse(raw);
        const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        if (d.date !== today) return json({ app: '出發了', items: [{ text: '今日尚未使用出發了', level: 'info' }] }, 200, getCors);
        // 新格式：多計畫 { plans: [{items, time}] }；舊格式相容
        const plans = d.plans;
        if (!Array.isArray(plans)) return json({ app: '出發了', items: d.items || [] }, 200, getCors);
        const items = [];
        plans.forEach((plan, i) => {
          const planItems = plan.items || [];
          // 第一筆：計畫名稱（第1個 item）
          const title = planItems[0];
          const timeTag = plan.time ? `（${plan.time}）` : '';
          if (title) items.push({ text: `計畫${i + 1}${timeTag}：${title.text.replace(/^計畫：/, '')}`, level: 'info' });
          // 中間：目的地 + 攜帶（折疊細節）
          planItems.slice(1, -1).forEach(it => items.push({ text: `　${it.text}`, level: it.level }));
        });
        // 最後一筆 = 摘要（Portal 折疊時顯示）
        items.push({ text: `今日共 ${plans.length} 個出行計畫`, level: 'ok' });
        return json({ app: '出發了', items }, 200, getCors);
      }

      return json({ error: 'not found' }, 404, getCors);
    }

    // ---- App 推送：家事幫手今日摘要（覆蓋，取最新狀態）----
    if (request.method === 'POST' && url.pathname === '/chores/save') {
      if (!env.SYNC) return json({ error: 'KV 尚未綁定' }, 500, cors);
      const code = String(url.searchParams.get('code') || '').trim();
      if (code.length < 6) return json({ error: '同步碼至少 6 個字' }, 400, cors);
      let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      await env.SYNC.put('chores:' + code, JSON.stringify({ date: today, items: b.items || [] }), { expirationTtl: 86400 });
      return json({ ok: true }, 200, cors);
    }

    // ---- App 推送：出發了今日計畫（append 模式，同日多趟累積）----
    if (request.method === 'POST' && url.pathname === '/depart/save') {
      if (!env.SYNC) return json({ error: 'KV 尚未綁定' }, 500, cors);
      const code = String(url.searchParams.get('code') || '').trim();
      if (code.length < 6) return json({ error: '同步碼至少 6 個字' }, 400, cors);
      let b; try { b = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      const timeStr = new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
      const rawEx = await env.SYNC.get('depart:' + code);
      const existing = rawEx ? JSON.parse(rawEx) : null;
      const plans = (existing?.date === today && Array.isArray(existing?.plans)) ? existing.plans : [];
      plans.push({ items: b.items || [], time: timeStr });
      await env.SYNC.put('depart:' + code, JSON.stringify({ date: today, plans }), { expirationTtl: 86400 });
      return json({ ok: true, count: plans.length }, 200, cors);
    }

    // ---- Scriptable 推送：運動小夥伴今日摘要 ----
    if (request.method === 'POST' && url.pathname === '/exercise/save') {
      if (!env.SYNC) return json({ error: 'KV 尚未綁定' }, 500, cors);
      const code = String(url.searchParams.get('code') || '').trim();
      if (code.length < 6) return json({ error: '同步碼至少 6 個字' }, 400, cors);
      let body2;
      try { body2 = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
      const payload = { date: today, items: body2.items || [], summary: body2.summary || '' };
      await env.SYNC.put('ex:' + code, JSON.stringify(payload), { expirationTtl: 86400 * 3 });
      return json({ ok: true }, 200, cors);
    }

    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    // 防濫用：只接受來自本 App 網域的請求（擋掉別的網站與大部分亂打）
    if (!originOk) return json({ error: 'forbidden origin' }, 403, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }

    // ---- 雲端同步（用同步碼存取 KV）----
    const path = new URL(request.url).pathname;
    if (path === '/sync/save' || path === '/sync/load') {
      if (!env.SYNC) return json({ error: 'KV 尚未綁定（請建立 SYNC namespace 並 deploy）' }, 500, cors);
      const code = String(body.code || '').trim();
      if (code.length < 6) return json({ error: '同步碼至少 6 個字' }, 400, cors);
      const key = 'sync:' + code;
      if (path === '/sync/save') {
        await env.SYNC.put(key, JSON.stringify(body.data || {}));
        return json({ ok: true }, 200, cors);
      } else {
        const v = await env.SYNC.get(key);
        return json({ data: v ? JSON.parse(v) : null }, 200, cors);
      }
    }

    // ---- 依小孩逐筆合併（雙向、不互相覆蓋）----
    if (path === '/sync/merge') {
      if (!env.SYNC) return json({ error: 'KV 尚未綁定' }, 500, cors);
      const code = String(body.code || '').trim();
      if (code.length < 6) return json({ error: '同步碼至少 6 個字' }, 400, cors);
      const key = 'm2:' + code;
      const raw = await env.SYNC.get(key);
      const stored = raw ? JSON.parse(raw)
        : { children: {}, shared: { rewards: [], customChores: [], customActions: [], t: 0 }, deleted: {} };
      if (!stored.children) stored.children = {};
      if (!stored.shared) stored.shared = { rewards: [], customChores: [], customActions: [], t: 0 };
      if (!stored.deleted) stored.deleted = {};
      const inc = body.doc || {};
      // 每個小孩：誰的時間戳新就用誰的
      const inC = inc.children || {};
      for (const cid in inC) {
        if (!stored.children[cid] || (inC[cid].t || 0) >= (stored.children[cid].t || 0)) stored.children[cid] = inC[cid];
      }
      // 共用設定（獎勵/自訂內容）：較新者勝
      if (inc.shared && (inc.shared.t || 0) > (stored.shared.t || 0)) stored.shared = inc.shared;
      // 刪除墓碑：傳播刪除
      const inD = inc.deleted || {};
      for (const cid in inD) stored.deleted[cid] = Math.max(stored.deleted[cid] || 0, inD[cid]);
      for (const cid in stored.deleted) {
        if (stored.children[cid] && stored.deleted[cid] >= (stored.children[cid].t || 0)) delete stored.children[cid];
      }
      await env.SYNC.put(key, JSON.stringify(stored));
      return json({ doc: stored }, 200, cors);
    }

    // ---- 天氣：優先中央氣象署 CWA（台灣準），失敗退回 Open-Meteo ----
    if (path === '/weather') {
      const debug = url.searchParams.get('debug') === '1';
      const city = normCity(body.city || '');
      const district = String(body.district || '').trim();
      const id = CWA_MAP[city];
      let cwaSkip = '';
      if (!id) cwaSkip = 'no-dataset-for-city:' + city;
      else if (!env.CWA_KEY) cwaSkip = 'no-CWA_KEY';
      else if (!district) cwaSkip = 'no-district';
      else {
        try {
          const u = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${id}`
            + `?Authorization=${env.CWA_KEY}&LocationName=${encodeURIComponent(district)}`
            + `&ElementName=${encodeURIComponent('天氣現象,溫度')}`;
          const r = await fetch(u, { headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept': 'application/json',
          }});
          if (!r.ok) { cwaSkip = 'http-' + r.status; }
          else {
            const text = await r.text();
            if (text[0] !== '{') { cwaSkip = 'blocked:' + text.slice(0, 40); }
            else {
              const d = JSON.parse(text);
              const loc = d.records && d.records.Locations && d.records.Locations[0]
                && d.records.Locations[0].Location && d.records.Locations[0].Location[0];
              if (!loc) { cwaSkip = 'no-location-match:' + district; }
              else {
                const wx = pickNow(loc, '天氣現象');
                const tp = pickNow(loc, '溫度');
                if (wx && wx.Weather) {
                  return json({ source: 'cwa', weather: wx.Weather, code: wx.WeatherCode,
                    temp: tp ? Number(tp.Temperature) : null }, 200, cors);
                }
                cwaSkip = 'no-weather-element';
              }
            }
          }
        } catch (e) { cwaSkip = 'err:' + e.message; }
      }
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${body.lat}&longitude=${body.lon}&current=temperature_2m,weather_code&timezone=auto`);
        const j = await r.json();
        return json({ source: 'open-meteo', code: j.current.weather_code, temp: j.current.temperature_2m, ...(debug ? { cwaSkip } : {}) }, 200, cors);
      } catch (e) { return json({ error: 'weather failed', cwaSkip }, 502, cors); }
    }

    const userPrompt = buildPrompt(body);
    if (!userPrompt) return json({ error: 'unknown type' }, 400, cors);

    let items = null, provider = null, err = '';
    try { items = await callMiniMax(env, userPrompt); provider = 'minimax'; }
    catch (e) { err = 'minimax: ' + e.message; }
    if (!items) {
      try { items = await callDeepSeek(env, userPrompt); provider = 'deepseek'; }
      catch (e) { err += ' | deepseek: ' + e.message; }
    }
    if (!items) return json({ error: err || 'all providers failed' }, 502, cors);
    return json({ items, provider }, 200, cors);
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

function buildPrompt(b) {
  const n = Math.min(Math.max(parseInt(b.count) || 3, 1), 6);
  const age = ({ '4-6': '4到6歲', '7-9': '7到9歲', '10-12': '10到12歲' })[b.age] || '7到9歲';
  if (b.type === 'energy') {
    const place = ({ indoor: '室內', outdoor: '戶外', small: '客廳小空間' })[b.place] || '室內';
    const time = ({ morning: '早上(偏喚醒)', afternoon: '下午(活力全開)', evening: '晚上(緩和、幫助入睡)' })[b.time] || '下午';
    return `幫${age}的小孩設計 ${n} 個在「${place}、${time}」做的放電運動動作。`
      + `回傳 JSON 陣列，每個物件欄位：name(動作名,5字內)、desc(一句話說明)、`
      + `metric(時間或次數,例如「30秒」「20下」)、difficulty(只能是 easy 或 normal 或 hard)。`;
  }
  if (b.type === 'level') {
    return `幫${age}的小孩設計 ${n} 個體能闖關關卡（要有趣、像遊戲關卡名）。`
      + `回傳 JSON 陣列，每個物件欄位：name(關卡名,6字內)、`
      + `type(只能是 balance 或 jump 或 coordination 或 core 或 flexibility)、`
      + `desc(一句話動作說明)、goal(完成條件,例如「單腳站20秒」)、emoji(一個相關emoji)。`;
  }
  if (b.type === 'chore') {
    return `幫${age}的小孩設計 ${n} 個適合「自己動手做」的簡單家事。`
      + `回傳 JSON 陣列，每個物件欄位：name(家事名,8字內)、desc(一句話說明)、`
      + `age(只能是 4-6 或 7-9 或 10-12)、stars(1到3的整數)、emoji(一個相關emoji)。`;
  }
  if (b.type === 'reward') {
    return `幫家長想 ${n} 個適合${age}小孩的「集點獎勵」（以活動/特權/小確幸為主，少用花錢買的物質獎勵，要正向健康）。`
      + `回傳 JSON 陣列，每個物件欄位：name(獎勵名,12字內)、cost(建議所需星星數,5到30的整數)、emoji(一個相關emoji)。`;
  }
  if (b.type === 'flow') {
    const which = b.flow === 'night' ? '睡前' : '晨間';
    return `幫${age}的小孩設計 ${n} 個${which}流程的步驟（要簡短好懂）。`
      + `回傳 JSON 陣列，每個物件欄位：text(步驟名稱,8字內)。`;
  }
  return null;
}

async function callMiniMax(env, userPrompt) {
  if (!env.MINIMAX_API_KEY) throw new Error('no key');
  const endpoint = env.MINIMAX_ENDPOINT || 'https://api.minimaxi.chat/v1/text/chatcompletion_v2';
  const model = env.MINIMAX_MODEL || 'MiniMax-Text-01';
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.MINIMAX_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt }],
      temperature: 0.9,
    }),
  });
  if (!r.ok) throw new Error('http ' + r.status);
  const d = await r.json();
  const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!text) throw new Error('no content');
  return parseItems(text);
}

async function callDeepSeek(env, userPrompt) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('no key');
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.DEEPSEEK_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: SYS }, { role: 'user', content: userPrompt }],
      temperature: 0.9,
    }),
  });
  if (!r.ok) throw new Error('http ' + r.status);
  const d = await r.json();
  const text = d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
  if (!text) throw new Error('no content');
  return parseItems(text);
}

// 把模型回傳的文字解析成 JSON 陣列（容忍 ```json``` 框與多餘文字）
function parseItems(text) {
  let t = String(text).trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  const arr = JSON.parse(t);
  if (!Array.isArray(arr) || !arr.length) throw new Error('not array');
  return arr;
}

/* ===========================================================
   即時編輯鎖 Durable Object（一個同步碼 = 一間房）
   以小孩為單位上鎖：同一個小孩同時只有一台能編輯，其餘唯讀。
   鎖只存在記憶體，斷線/關閉自動釋放。
   =========================================================== */
const STALE_MS = 30000;   // 超過 30 秒沒心跳 → 視為離線，鎖自動釋放
export class FamilyRoom {
  constructor(state, env) {
    this.sessions = new Map(); // ws -> {id, childId, name, seen}
    this.locks = new Map();    // childId -> sessionId
  }
  async fetch(request) {
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    const session = { id: crypto.randomUUID(), childId: null, name: '某台裝置', seen: Date.now() };
    this.sessions.set(server, session);
    server.send(JSON.stringify({ type: 'welcome', sid: session.id }));
    this.sweep(); this.sendLocks(server);

    server.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      session.seen = Date.now();
      if (m.type === 'hello') {
        if (m.name) session.name = String(m.name).slice(0, 16);
        this.sweep(); this.broadcast();
      } else if (m.type === 'ping') {
        if (this.sweep()) this.broadcast();          // 順便清掉過期幽靈鎖
      } else if (m.type === 'acquire' && m.childId) {
        if (m.name) session.name = String(m.name).slice(0, 16);
        this.acquire(session, m.childId, false);
      } else if (m.type === 'steal' && m.childId) {  // 強制奪回（使用者按「改由我操作」）
        if (m.name) session.name = String(m.name).slice(0, 16);
        this.acquire(session, m.childId, true);
      } else if (m.type === 'release') {
        this.releaseBy(session.id); session.childId = null;
        this.broadcast();
      } else if (m.type === 'synced') {
        // 某台剛上傳更新 → 通知其他在線裝置立即拉取（即時同步）
        const msg = JSON.stringify({ type: 'peersync' });
        for (const [ws, s] of this.sessions) { if (s.id !== session.id) { try { ws.send(msg); } catch (e) {} } }
      }
    });
    const close = () => { this.sessions.delete(server); this.releaseBy(session.id); this.broadcast(); };
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  acquire(session, cid, force) {
    this.sweep();
    const holder = this.locks.get(cid);
    this.releaseBy(session.id);                 // 一台只持有一個小孩
    if (force || !holder || holder === session.id || this.isStale(holder)) {
      this.locks.set(cid, session.id);
      session.childId = cid;
    }
    this.broadcast();
  }
  isStale(sid) {
    for (const s of this.sessions.values()) if (s.id === sid) return (Date.now() - s.seen) > STALE_MS;
    return true;   // 連線已不在
  }
  sweep() {
    let changed = false;
    for (const [cid, sid] of this.locks) if (this.isStale(sid)) { this.locks.delete(cid); changed = true; }
    return changed;
  }
  nameOf(sid) { for (const s of this.sessions.values()) if (s.id === sid) return s.name; return '其他裝置'; }
  releaseBy(sid) { for (const [cid, h] of this.locks) if (h === sid) this.locks.delete(cid); }
  lockMap() { this.sweep(); const o = {}; for (const [cid, sid] of this.locks) o[cid] = { by: this.nameOf(sid), sid }; return o; }
  sendLocks(ws) { try { ws.send(JSON.stringify({ type: 'locks', locks: this.lockMap() })); } catch (e) {} }
  broadcast() { const msg = JSON.stringify({ type: 'locks', locks: this.lockMap() }); for (const ws of this.sessions.keys()) { try { ws.send(msg); } catch (e) {} } }
}
