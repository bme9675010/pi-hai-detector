/* ===========================================================
   天氣模組
   - 有設定後端 → 走 Worker /weather（中央氣象署 CWA，台灣最準）
   - 沒後端或 CWA 失敗 → Open-Meteo（全球模型，免 key）
   =========================================================== */
const WEATHER_KEY = 'pi_hai_weather_v1';
const WEATHER_TTL = 30 * 60 * 1000;                 // 快取 30 分鐘
const DEFAULT_COORDS = { lat: 25.04, lon: 121.56, name: '台北（預設）' };

/* WMO 天氣代碼 → emoji + 中文（Open-Meteo 用） */
function wmoInfo(code) {
  if (code === 0) return { emoji:'☀️', label:'晴朗' };
  if (code <= 2)  return { emoji:'🌤️', label:'晴時多雲' };
  if (code === 3) return { emoji:'☁️', label:'多雲' };
  if (code === 45 || code === 48) return { emoji:'🌫️', label:'起霧' };
  if (code >= 51 && code <= 57)  return { emoji:'🌦️', label:'毛毛雨' };
  if (code >= 61 && code <= 67)  return { emoji:'🌧️', label:'下雨' };
  if (code >= 71 && code <= 77)  return { emoji:'❄️', label:'下雪' };
  if (code >= 80 && code <= 82)  return { emoji:'🌧️', label:'陣雨' };
  if (code >= 85 && code <= 86)  return { emoji:'🌨️', label:'陣雪' };
  if (code >= 95)                return { emoji:'⛈️', label:'雷雨' };
  return { emoji:'🌡️', label:'—' };
}

/* CWA 天氣現象文字 → emoji */
function cwaEmoji(s) {
  s = s || '';
  if (/雷/.test(s)) return '⛈️';
  if (/雪/.test(s)) return '❄️';
  if (/雨/.test(s)) return '🌧️';
  if (/霧/.test(s)) return '🌫️';
  if (/晴.*多雲|多雲.*晴/.test(s)) return '🌤️';
  if (/陰/.test(s)) return '☁️';
  if (/多雲/.test(s)) return '⛅';
  if (/晴/.test(s)) return '☀️';
  return '🌡️';
}

/* 依天氣給場地建議 + 一句話（兩種來源通用） */
function weatherAdvice(w) {
  const t = w.temp;
  let rain = w.isRain, snow = w.isSnow;
  if (rain === undefined && typeof w.code === 'number') {
    const c = w.code;
    rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
    snow = (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  }
  if (rain)        return { place:'indoor',  note:'外面在下雨，建議室內放電 ☔' };
  if (snow)        return { place:'indoor',  note:'外面在下雪，建議室內暖暖身 ☃️' };
  if (t >= 33)     return { place:'indoor',  note:'天氣很熱，建議室內或緩和動作，記得多喝水 💧' };
  if (t != null && t <= 10) return { place:'indoor', note:'天氣很冷，建議室內活動先暖身 🧣' };
  return { place:'outdoor', note:'天氣不錯，很適合到戶外放電 🌳' };
}

/* 取得座標：先試 GPS，失敗/拒絕就用預設 */
function getCoords(fresh) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ ...DEFAULT_COORDS, isDefault: true });
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, isDefault: false }),
      () => resolve({ ...DEFAULT_COORDS, isDefault: true }),
      { timeout: 15000, maximumAge: fresh ? 0 : WEATHER_TTL }
    );
  });
}

/* 反向地理編碼：座標 → { name, city, district } */
async function reverseName(lat, lon) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-TW`);
    if (r.ok) {
      const a = (await r.json()).address || {};
      const city = a.city || a.county || a.state || '';
      const dist = a.town || a.city_district || a.district || a.suburb || '';
      const name = [...new Set([city, dist].filter(Boolean))].join(' ').trim();
      if (name) return { name, city, district: dist };
    }
  } catch (e) {}
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`);
    const j = await r.json();
    const city = j.principalSubdivision || '';
    const dist = j.locality || j.city || '';
    const name = [...new Set([city, dist].filter(Boolean))].join(' ').trim();
    return { name: name || '你的位置', city, district: dist };
  } catch (e) {
    return { name: '你的位置', city: '', district: '' };
  }
}

async function openMeteo(co, name, isDefault) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${co.lat}&longitude=${co.lon}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather http ' + res.status);
  const cur = (await res.json()).current || {};
  const info = wmoInfo(cur.weather_code);
  return {
    temp: Math.round(cur.temperature_2m), code: cur.weather_code,
    emoji: info.emoji, label: info.label,
    place: name, isDefault, source: 'open-meteo', ts: Date.now(),
  };
}

async function fetchWeather(fresh, proxyBase) {
  const co = await getCoords(fresh);
  if (co.isDefault) return await openMeteo(co, '台北（預設）', true);

  const loc = await reverseName(co.lat, co.lon);

  // 有後端就先試 CWA（台灣最準）
  if (proxyBase && loc.city && loc.district) {
    try {
      const res = await fetch(proxyBase.replace(/\/+$/, '') + '/weather', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: loc.city, district: loc.district, lat: co.lat, lon: co.lon }),
      });
      const d = await res.json();
      if (res.ok && d.source === 'cwa' && d.weather) {
        return {
          temp: d.temp != null ? Math.round(d.temp) : null, code: null,
          emoji: cwaEmoji(d.weather), label: d.weather,
          isRain: /雨|雷/.test(d.weather), isSnow: /雪/.test(d.weather),
          place: loc.name, isDefault: false, source: 'cwa', ts: Date.now(),
        };
      }
      if (res.ok && d.source === 'open-meteo' && typeof d.code === 'number') {
        const info = wmoInfo(d.code);
        return {
          temp: Math.round(d.temp), code: d.code, emoji: info.emoji, label: info.label,
          place: loc.name, isDefault: false, source: 'open-meteo', ts: Date.now(),
        };
      }
    } catch (e) { /* 失敗就走前端 Open-Meteo */ }
  }
  return await openMeteo(co, loc.name, false);
}

/* 對外：取得天氣（真實位置 30 分鐘內走快取；預設值不快取以便重試定位） */
async function getWeather(force, proxyBase) {
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    if (!force && raw) {
      const cached = JSON.parse(raw);
      if (!cached.isDefault && Date.now() - cached.ts < WEATHER_TTL) return cached;
    }
  } catch (e) {}
  const w = await fetchWeather(force, proxyBase);
  if (!w.isDefault) {
    try { localStorage.setItem(WEATHER_KEY, JSON.stringify(w)); } catch (e) {}
  } else {
    try { localStorage.removeItem(WEATHER_KEY); } catch (e) {}
  }
  return w;
}

window.WEATHER = { getWeather, weatherAdvice };
