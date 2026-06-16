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

## MiniMax 設定注意

`wrangler.toml` 裡的 `MINIMAX_ENDPOINT` 和 `MINIMAX_MODEL` 預設是國際站。
若你的 MiniMax 是中國站、或型號不同，改 `wrangler.toml` 後重新 `wrangler deploy`：

- 國際站端點：`https://api.minimaxi.chat/v1/text/chatcompletion_v2`
- 中國站端點：`https://api.minimax.chat/v1/text/chatcompletion_v2`
- 常見模型：`MiniMax-Text-01`、`abab6.5s-chat`

就算 MiniMax 設定錯，DeepSeek 仍會自動接手，所以一定能動。

## 本機測試（選用）
```
wrangler dev
```
然後對 `http://localhost:8787` POST：
```json
{ "type": "energy", "age": "7-9", "place": "indoor", "time": "afternoon", "count": 3 }
```
type 可為：energy / level / chore / flow（flow 另帶 "flow":"morning"|"night"）。
