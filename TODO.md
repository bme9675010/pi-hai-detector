# 屁孩特攻隊 — 待辦清單

## 待辦（尚未實作）

### 6. 提醒通知（推播）
- 早上提醒做晨間流程、睡前提醒等。
- Android Chrome PWA 可用 Notification API + 背景；iOS Safari PWA 推播限制多（需加到主畫面且支援有限）。
- 可能需要簡單後端或排程；先評估僅本地 Notification 是否夠用。

### 7. 雲端同步 / 多裝置
- 目前資料只存手機本機（localStorage），換手機需手動匯出/匯入。
- 要做需加後端 + 帳號登入（如 Firebase）。複雜度高，目前非必要。

### 8. 自動化測試
- 目前靠手動 + 預覽驗證。
- 可加簡單的單元測試（generateActions、awardOnce、computeStreak、reverseName 等純函式）。

## 已知平台限制
- iOS Safari 不支援 `navigator.vibrate`，完成任務只有音效、沒有震動（Android 兩者都有）。

## 已完成（參考）
- 5 模組 + 首頁、多小孩、星星、兌換商店、成就徽章
- 天氣 API（Open-Meteo + Nominatim 到「區」）、放電時段化
- 資料備份匯出/匯入、深色模式
- 日期本地化、星星防刷、自訂內容（動作/關卡/家事）
- 連續天數 streak、歷史月曆、家事依年齡過濾
