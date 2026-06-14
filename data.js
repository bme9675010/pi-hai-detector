/* ===========================================================
   屁孩偵測器 — 預設資料庫
   所有可調整的內容都集中在這裡，方便日後擴充
   =========================================================== */

/* ---------- 模組 1：放電動作庫 ----------
   tags 用來篩選：年齡層 / 場地 / 時段
   age: 4-6 / 7-9 / 10-12
   place: indoor(室內) / outdoor(戶外) / small(客廳小空間)
   times: morning(早上,偏喚醒) / afternoon(下午,全力) / evening(晚上,偏緩和避免睡前太亢奮)
   difficulty: easy(簡單) / normal(普通) / hard(挑戰)
   duration: 預估秒數，用來湊滿時間
*/
const ACTION_POOL = [
  { name: "原地跑步",   desc: "原地用力跑，膝蓋抬高",         metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","outdoor","small"], times: ["morning","afternoon"],            seconds: 60 },
  { name: "開合跳",     desc: "雙手雙腳同時打開再合起",       metric: "20 下",   difficulty: "normal", ages: ["7-9","10-12"],       places: ["indoor","outdoor","small"], times: ["morning","afternoon"],            seconds: 40 },
  { name: "熊爬",       desc: "手腳著地像熊一樣往前爬",       metric: "30 秒",   difficulty: "normal", ages: ["4-6","7-9","10-12"], places: ["indoor","outdoor","small"], times: ["morning","afternoon","evening"],  seconds: 30 },
  { name: "螃蟹走路",   desc: "屁股離地，手腳撐地橫著走",     metric: "30 秒",   difficulty: "hard",   ages: ["7-9","10-12"],       places: ["indoor","outdoor"],          times: ["morning","afternoon","evening"],  seconds: 30 },
  { name: "單腳站",     desc: "像小白鶴一樣單腳站好不要倒",   metric: "20 秒",   difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","outdoor","small"], times: ["morning","afternoon","evening"],  seconds: 20 },
  { name: "收玩具比賽", desc: "比賽看誰收得快又整齊",         metric: "3 分鐘",  difficulty: "easy",   ages: ["4-6","7-9"],          places: ["indoor","small"],            times: ["afternoon","evening"],            seconds: 180 },
  { name: "深蹲",       desc: "屁股往後坐，膝蓋不超過腳尖",   metric: "10 下",   difficulty: "normal", ages: ["7-9","10-12"],       places: ["indoor","outdoor","small"], times: ["morning","afternoon"],            seconds: 40 },
  { name: "伸展操",     desc: "慢慢拉拉手、拉拉腳、轉一轉",   metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","outdoor","small"], times: ["morning","afternoon","evening"],  seconds: 60 },
  { name: "兔子跳",     desc: "蹲低，雙腳一起往前跳",         metric: "15 下",   difficulty: "easy",   ages: ["4-6","7-9"],          places: ["indoor","outdoor","small"], times: ["morning","afternoon"],            seconds: 40 },
  { name: "高抬腿",     desc: "原地把膝蓋輪流抬到肚子高",     metric: "30 秒",   difficulty: "normal", ages: ["7-9","10-12"],       places: ["indoor","outdoor","small"], times: ["morning","afternoon"],            seconds: 30 },
  { name: "超人飛",     desc: "趴著把手腳同時抬起來像超人",   metric: "20 秒",   difficulty: "hard",   ages: ["7-9","10-12"],       places: ["indoor","small"],            times: ["morning","afternoon","evening"],  seconds: 20 },
  { name: "踏步唱歌",   desc: "一邊原地踏步一邊唱一首歌",     metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6"],                places: ["indoor","small"],            times: ["morning","afternoon"],            seconds: 60 },
  { name: "平板撐",     desc: "手肘撐地，身體打直像木板",     metric: "15 秒",   difficulty: "hard",   ages: ["7-9","10-12"],       places: ["indoor","small"],            times: ["morning","afternoon","evening"],  seconds: 20 },
  { name: "波比跳",     desc: "蹲下、撐地、跳起來，連續做",   metric: "8 下",    difficulty: "hard",   ages: ["10-12"],              places: ["indoor","outdoor"],          times: ["morning","afternoon"],            seconds: 60 },
  { name: "學動物走",   desc: "輪流學鴨子、青蛙、大象走路",   metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6"],                places: ["indoor","outdoor","small"], times: ["morning","afternoon","evening"],  seconds: 60 },
  { name: "深呼吸放鬆", desc: "慢慢吸氣 4 秒、吐氣 4 秒，重複",metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","outdoor","small"], times: ["evening"],                        seconds: 60 },
  { name: "貓牛伸展",   desc: "四足跪姿，背部一拱一凹慢慢做", metric: "1 分鐘",  difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","small"],            times: ["evening"],                        seconds: 60 },
  { name: "睡前抱膝",   desc: "躺著抱住膝蓋輕輕左右搖",       metric: "30 秒",   difficulty: "easy",   ages: ["4-6","7-9","10-12"], places: ["indoor","small"],            times: ["evening"],                        seconds: 30 },
];

/* ---------- 模組 2：體能闖關 ----------
   type: balance(平衡) jump(跳躍) coordination(協調) core(核心) flexibility(柔軟)
*/
const DEFAULT_LEVELS = [
  { id: "lv1", name: "平衡星球", type: "balance",     desc: "單腳站像小白鶴",   goal: "單腳站 20 秒", emoji: "🪐" },
  { id: "lv2", name: "跳跳火山", type: "jump",        desc: "原地用力往上跳",   goal: "原地跳 30 下", emoji: "🌋" },
  { id: "lv3", name: "熊熊爬山", type: "coordination",desc: "手腳並用往前爬",   goal: "熊爬 30 秒",   emoji: "🐻" },
  { id: "lv4", name: "螃蟹海灘", type: "coordination",desc: "屁股離地橫著走",   goal: "螃蟹走路 30 秒", emoji: "🦀" },
  { id: "lv5", name: "超人核心", type: "core",        desc: "撐起身體像木板",   goal: "平板撐 15 秒", emoji: "🦸" },
  { id: "lv6", name: "彩虹伸展", type: "flexibility", desc: "坐著慢慢往前彎",   goal: "坐姿前彎 20 秒", emoji: "🌈" },
  { id: "lv7", name: "閃電快腿", type: "jump",        desc: "原地高抬腿快快跑", goal: "高抬腿 40 秒", emoji: "⚡" },
  { id: "lv8", name: "金雞獨立", type: "balance",     desc: "閉眼單腳站挑戰",   goal: "閉眼單腳站 10 秒", emoji: "🐔" },
  { id: "lv9", name: "袋鼠樂園", type: "jump",        desc: "雙腳併攏連續往前跳", goal: "立定跳 10 下", emoji: "🦘" },
  { id: "lv10", name: "陀螺轉轉", type: "coordination", desc: "原地轉圈後走直線",  goal: "轉 5 圈再走直線", emoji: "🌀" },
  { id: "lv11", name: "鱷魚爬行", type: "core",       desc: "趴低用手肘往前爬", goal: "低姿爬行 30 秒", emoji: "🐊" },
  { id: "lv12", name: "瑜伽樹式", type: "balance",    desc: "單腳站手往上伸像樹", goal: "樹式 20 秒", emoji: "🌳" },
  { id: "lv13", name: "毛毛蟲伸展", type: "flexibility", desc: "站著彎腰手走到前方", goal: "毛毛蟲走 5 次", emoji: "🐛" },
  { id: "lv14", name: "火箭發射", type: "jump",       desc: "蹲低再用力往上跳高", goal: "蹲跳 12 下", emoji: "🚀" },
];

const LEVEL_TYPE_LABEL = {
  balance: "平衡", jump: "跳躍", coordination: "協調", core: "核心", flexibility: "柔軟"
};

/* ---------- 模組 4：流程卡 ---------- */
const DEFAULT_FLOWS = {
  morning: { title: "晨間流程", emoji: "🌅", steps: ["起床","刷牙洗臉","換衣服","吃早餐","帶水壺","背書包"] },
  night:   { title: "睡前流程", emoji: "🌙", steps: ["收玩具","洗澡","刷牙","整理書包","看一本書","關燈"] },
};

/* ---------- 模組 5：家事任務 ---------- */
const DEFAULT_CHORES = [
  { name: "收自己的碗",       desc: "吃完飯把碗拿到水槽",       age: "4-6",   stars: 1, emoji: "🍚" },
  { name: "整理 5 個玩具",    desc: "把 5 個玩具放回箱子",       age: "4-6",   stars: 1, emoji: "🧸" },
  { name: "把襪子放洗衣籃",   desc: "脫下來的襪子丟進籃子",       age: "4-6",   stars: 1, emoji: "🧦" },
  { name: "書包放定位",       desc: "回家把書包放到固定的地方",   age: "7-9",   stars: 1, emoji: "🎒" },
  { name: "幫忙擦桌子",       desc: "用抹布把桌子擦乾淨",         age: "7-9",   stars: 2, emoji: "🧽" },
  { name: "把水壺拿出來",     desc: "把書包裡的水壺拿出來清洗",   age: "7-9",   stars: 1, emoji: "💧" },
  { name: "整理鞋子",         desc: "把全家的鞋子排整齊",         age: "7-9",   stars: 2, emoji: "👟" },
  { name: "把故事書放回書架", desc: "看完的書放回書架原位",       age: "4-6",   stars: 1, emoji: "📚" },
  { name: "幫忙摺自己的衣服", desc: "把曬乾的衣服摺好",           age: "10-12", stars: 2, emoji: "👕" },
  { name: "倒垃圾",           desc: "幫忙把小垃圾袋拿去丟",       age: "10-12", stars: 2, emoji: "🗑️" },
  { name: "幫忙擺碗筷",       desc: "吃飯前把碗筷擺好",           age: "4-6",   stars: 1, emoji: "🥢" },
  { name: "澆花",             desc: "幫家裡的植物澆水",           age: "7-9",   stars: 1, emoji: "🪴" },
  { name: "整理書桌",         desc: "把書桌上的東西收整齊",       age: "7-9",   stars: 2, emoji: "🖊️" },
  { name: "餵寵物",           desc: "幫寵物加飼料或換水",         age: "7-9",   stars: 1, emoji: "🐶" },
  { name: "把曬乾的襪子配對", desc: "把襪子兩兩配成一雙",         age: "4-6",   stars: 1, emoji: "🧦" },
  { name: "擦自己的鞋子",     desc: "把鞋子擦乾淨",               age: "10-12", stars: 2, emoji: "👟" },
];

/* ---------- 狀態紀錄選項 ---------- */
const STATUS_FIELDS = [
  { key: "spirit",   label: "精神", emoji: "⚡", options: ["好","普通","很累"] },
  { key: "mood",     label: "心情", emoji: "😊", options: ["開心","普通","煩躁"] },
  { key: "appetite", label: "食慾", emoji: "🍽️", options: ["好","普通","差"] },
  { key: "sleep",    label: "睡眠", emoji: "😴", options: ["好","普通","不好"] },
  { key: "activity", label: "活動量", emoji: "🏃", options: ["不足","剛好","太多"] },
];

/* ---------- 星星兌換獎勵（家長可自訂） ---------- */
const DEFAULT_REWARDS = [
  { name: "看卡通 30 分鐘", cost: 10, emoji: "📺" },
  { name: "挑一個點心",     cost: 8,  emoji: "🍪" },
  { name: "玩遊戲 20 分鐘", cost: 15, emoji: "🎮" },
  { name: "晚睡 15 分鐘",   cost: 20, emoji: "🌙" },
  { name: "選今天的晚餐",   cost: 25, emoji: "🍜" },
  { name: "去公園玩",       cost: 30, emoji: "🛝" },
];

/* 小孩顏色選項 */
const CHILD_COLORS = ["#FF6B6B","#4ECDC4","#FFD93D","#6BCB77","#A66CFF","#FF9F45","#5C7CFA","#FF6FB5"];

window.APP_DATA = {
  ACTION_POOL, DEFAULT_LEVELS, LEVEL_TYPE_LABEL,
  DEFAULT_FLOWS, DEFAULT_CHORES, STATUS_FIELDS, CHILD_COLORS, DEFAULT_REWARDS
};
