/* ===========================================================
   天氣模組 — 使用 Open-Meteo
   免費、免 API key、免註冊、支援瀏覽器直接呼叫（無 key 外洩風險）
   =========================================================== */
const WEATHER_KEY = 'pi_hai_weather_v1';
const WEATHER_TTL = 30 * 60 * 1000;                 // 快取 30 分鐘，避免一直打 API
const DEFAULT_COORDS = { lat: 25.04, lon: 121.56, name: '台北（預設）' };

/* WMO 天氣代碼 → emoji + 中文 */
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

/* 依天氣給場地建議 + 一句話 */
function weatherAdvice(w) {
  const c = w.code, t = w.temp;
  const rain = (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
  const snow = (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  if (rain)  return { place:'indoor',  note:'外面在下雨，建議室內放電 ☔' };
  if (snow)  return { place:'indoor',  note:'外面在下雪，建議室內暖暖身 ☃️' };
  if (t >= 33) return { place:'indoor',  note:'天氣很熱，建議室內或緩和動作，記得多喝水 💧' };
  if (t <= 10) return { place:'indoor',  note:'天氣很冷，建議室內活動先暖身 🧣' };
  return { place:'outdoor', note:'天氣不錯，很適合到戶外放電 🌳' };
}

/* 取得座標：先試 GPS，失敗/拒絕就用預設
   fresh=true 時強制重新定位（不吃位置快取），逾時拉長給使用者時間按「允許」 */
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

/* 反向地理編碼：座標 → 地名（縣市 + 行政區，例如「桃園市 桃園區」）
   主：OSM Nominatim（台灣行政區到「區」較完整）；後備：BigDataCloud */
async function reverseName(lat, lon) {
  // 主：Nominatim
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-TW&email=you@example.com`);
    if (r.ok) {
      const a = (await r.json()).address || {};
      const city = a.city || a.county || a.state;          // 縣市
      const dist = a.town || a.city_district || a.district || a.suburb; // 行政區
      const name = [...new Set([city, dist].filter(Boolean))].join(' ').trim();
      if (name) return name;
    }
  } catch (e) {}
  // 後備：BigDataCloud
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`);
    const j = await r.json();
    const name = [...new Set([j.principalSubdivision, j.locality || j.city].filter(Boolean))].join(' ').trim();
    return name || '你的位置';
  } catch (e) {
    return '你的位置';
  }
}

async function fetchWeather(fresh) {
  const co = await getCoords(fresh);
  const name = co.isDefault ? '台北（預設）' : await reverseName(co.lat, co.lon);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${co.lat}&longitude=${co.lon}&current=temperature_2m,weather_code&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather http ' + res.status);
  const j = await res.json();
  const cur = j.current || {};
  const info = wmoInfo(cur.weather_code);
  return {
    temp: Math.round(cur.temperature_2m),
    code: cur.weather_code,
    emoji: info.emoji,
    label: info.label,
    place: name,
    isDefault: co.isDefault,
    ts: Date.now()
  };
}

/* 對外：取得天氣
   - 有「真實位置」的 30 分鐘內快取才沿用
   - 若快取是預設值（沒定位成功），自動重試定位，不卡在預設
   - force=true 強制重新定位 */
async function getWeather(force) {
  try {
    const raw = localStorage.getItem(WEATHER_KEY);
    if (!force && raw) {
      const cached = JSON.parse(raw);
      if (!cached.isDefault && Date.now() - cached.ts < WEATHER_TTL) return cached;
    }
  } catch (e) {}
  const w = await fetchWeather(force);
  // 只快取抓到真實位置的結果；預設值不快取，下次進來會再試一次定位
  if (!w.isDefault) {
    try { localStorage.setItem(WEATHER_KEY, JSON.stringify(w)); } catch (e) {}
  } else {
    try { localStorage.removeItem(WEATHER_KEY); } catch (e) {}
  }
  return w;
}

window.WEATHER = { getWeather, weatherAdvice };
