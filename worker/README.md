# 屁孩特攻隊 — AI 生成後端（Cloudflare Worker）

這支 Worker 是「AI 生成任務」的後端代理。API key 存在 Cloudflare 的 secret，
前端只呼叫這支 Worker，**key 不會出現在前端、不會外洩**。
主用 MiniMax，失敗自動退回 DeepSeek。

## 部署步驟（用 wrangler CLI）

1. 安裝 Node（已有）後，安裝 wrangler 並登入 Cloudflare：
   ```
   npm install -g wrangler
   wrangler login
   ```
   （瀏覽器會開 Cloudflare 授權頁，沒帳號就免費註冊一個）

2. 進到這個資料夾：
   ```
   cd worker
   ```

3. 設定兩把 key（會提示貼上，輸入後不會顯示在檔案裡）：
   ```
   wrangler secret put MINIMAX_API_KEY
   wrangler secret put DEEPSEEK_API_KEY
   ```

4. 部署：
   ```
   wrangler deploy
   ```
   成功後會得到一個網址，像：
   `https://pi-hai-ai.<你的帳號>.workers.dev`

5. 把那個網址貼到 App →「管理」頁的「AI 生成服務網址」欄位，存檔即可。

## 天氣改用中央氣象署 CWA（台灣較準）

設定 CWA 授權碼（到 https://opendata.cwa.gov.tw/ 免費註冊取得），存成 secret 後重新部署：
```
wrangler secret put CWA_KEY
wrangler deploy
```
沒設定 CWA_KEY 時，天氣會自動用 Open-Meteo（全球模型）。
前端有設定「AI/同步服務網址」就會自動走這支 Worker 拿 CWA 天氣。

## MiniMax 設定注意

`wrangler.toml` 裡的 `MINIMAX_ENDPOINT` 和 `MINIMAX_MODEL` 預設是國際站。
若你的 MiniMax 是中國站、或型號不同，改 `wrangler.toml` 後重新 `wrangler deploy`：

- 國際站端點：`https://api.minimaxi.chat/v1/text/chatcompletion_v2`
- 中國站端點：`https://api.minimax.chat/v1/text/chatcompletion_v2`
- 常見模型：`MiniMax-Text-01`、`abab6.5s-chat`

就算 MiniMax 設定錯，DeepSeek 仍會自動接手，所以一定能動。

## 啟用雲端同步（多裝置）

1. 建立 KV namespace：
   ```
   wrangler kv namespace create SYNC
   ```
   它會印出一段像 `id = "abcd1234..."` 的內容。

2. 把那個 `id` 貼到 `wrangler.toml` 裡 `[[kv_namespaces]]` 的 `id = "PASTE_KV_ID_HERE"`。

3. 重新部署：
   ```
   wrangler deploy
   ```

4. 在 App →「管理」→「雲端同步」設一組同步碼（≥6 字），按「上傳到雲端」；
   另一台裝置輸入同一組同步碼按「從雲端下載」即可。
   ⚠️ 同步碼等於密碼，設長一點、不要外流。

## 本機測試（選用）
```
wrangler dev
```
然後對 `http://localhost:8787` POST：
```json
{ "type": "energy", "age": "7-9", "place": "indoor", "time": "afternoon", "count": 3 }
```
type 可為：energy / level / chore / flow（flow 另帶 "flow":"morning"|"night"）。
