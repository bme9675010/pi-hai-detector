/* ===========================================================
   屁孩特攻隊 — AI 生成代理 (Cloudflare Worker)
   key 存在 Cloudflare secret，前端只呼叫這支，不會外洩
   主：MiniMax，失敗自動退回 DeepSeek
   =========================================================== */

const SYS = '你是兒童運動與生活任務設計助手。只產生「安全、適齡、適合在家/客廳/公園」的內容，'
  + '避免任何危險動作（倒立、攀高、從高處跳下、激烈碰撞、需要他人保護或器材的動作）。'
  + '一律使用繁體中文。嚴格「只輸出 JSON 陣列」，不要任何說明文字、不要程式碼框。';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // 防濫用：只接受來自本 App 網域的請求（擋掉別的網站與大部分亂打）
    const allowed = env.ALLOWED_ORIGIN || '';
    const origin = request.headers.get('Origin');
    if (allowed && allowed !== '*' && origin !== allowed) {
      return json({ error: 'forbidden origin' }, 403, cors);
    }

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
