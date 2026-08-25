# 我的總資產

手動記錄台股 / 加密貨幣 / 現金外幣 / 負債，自動抓報價、算出總資產、淨值與報酬率，並畫出資產配置圓餅圖。資料存在瀏覽器本機（IndexedDB），不上傳任何地方。

## 怎麼跑起來

需要先裝 [Node.js](https://nodejs.org)（18 以上）。

```bash
npm install      # 第一次才需要
npm run dev      # 啟動，開瀏覽器到終端機印出的網址（通常 http://localhost:5173）
```

## 自動報價

- **加密貨幣、匯率**：瀏覽器直接抓，即時（每 60 秒更新，也可按「↻ 重新整理」）。
- **台股 / ETF**：由 `npm run data` 從證交所/櫃買整批抓「全部代號、名稱、收盤價」，寫成 `public/symbols.json`（搜尋清單）和 `public/prices.json`（每日收盤價）。所以**任何台股都會有價，不用維護清單**。
  - 本機測試就跑一次 `npm run data`，再重新整理瀏覽器。
  - 部署到 GitHub 後，`.github/workflows/deploy.yml` 會每 30 分鐘自動跑，完全免手動。

## 使用重點

- 新增台股/加密貨幣時，**代號**欄可以直接打代號或名稱搜尋、選了自動帶入名稱。
- 「現價」欄是後備，抓不到報價時才用。
- 可填「總投入成本」和「買入日期」，就會算報酬率；同一檔不同時間買的分開新增，會收在同一個大項下，各自看報酬、上面看合計。
- 右上 USD/TWD 預設自動；底部可匯出/匯入 JSON 備份。

## 檔案結構

```
src/
  db.js / store.js       Dexie 資料庫與唯一的資料存取層
  calc.js                分類、台幣換算、成本/報酬、彙總
  prices.js / symbols.js 前端報價與代號清單載入
  App.jsx
  components/            圓餅圖、表單、代號搜尋、可展開持倉列表
scripts/
  gen-data.mjs           整批產生台股價 + 代號清單
.github/workflows/
  deploy.yml             建置 + 部署 + 定時更新資料
```
