# 部署到 GitHub Pages

照著做就能讓這個 app 有一個線上網址，手機也能開。

## 先講三件事

- **要用 public repo**：免費的 GitHub Pages 只支援公開 repo。放心，你的資產數字**不會**上 GitHub——金額和持股都存在你自己的瀏覽器裡。上去的只有程式碼和 `watchlist.json`（別人只看得到你追蹤哪些代號，看不到你買了多少）。
- **線上版和本機版資料是分開的**：兩邊各自存在各自的瀏覽器，不會同步。線上版第一次打開是空的。要把本機資料搬過去，用底部的「匯出備份」存成 JSON，再到線上版「匯入備份」。（真正的跨裝置同步是第 5 階段的事。）
- **報價不用你管**：上線後 Actions 會每 30 分鐘自動抓股票價、重新部署；加密貨幣和匯率一樣由瀏覽器即時抓。

## 步驟

### 1. 建一個 repo
到 github.com → 右上「＋」→ New repository → 名稱填 `net-worth-app` → 選 **Public** → **不要**勾任何 "Add a README / .gitignore"（避免衝突）→ Create repository。

### 2. 把程式碼推上去

**方法 A：用 git 指令**（在專案資料夾裡）
```powershell
cd C:\Users\admin\Desktop\net-worth-app
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的帳號/net-worth-app.git
git push -u origin main
```
沒有 git 的話到 git-scm.com 裝，或用方法 B。

**方法 B：用 GitHub Desktop**（不想碰指令的話）
到 desktop.github.com 裝好 → File → Add local repository → 選這個資料夾 → Publish repository → **取消勾** "Keep this code private" → Publish。

### 3. 開啟 Pages
在 repo 頁面 → **Settings** → 左邊 **Pages** → "Build and deployment" 的 Source 選 **GitHub Actions**（不用選分支，選完就好）。

### 4. 等它部署
到 repo 的 **Actions** 分頁，會看到 "Deploy to GitHub Pages" 正在跑（第一次可能要先按一下綠色按鈕啟用 Actions）。跑完出現綠勾後，網址會出現在 **Settings → Pages** 最上面，長這樣：
```
https://你的帳號.github.io/net-worth-app/
```
用瀏覽器或手機打開就是了。

### 5. 之後要加股票
最方便的方式：直接在 GitHub 網站上點開 `watchlist.json` → 右上鉛筆圖示 → 改好 → Commit。一 commit 就會自動重新部署、帶上新代號的價。當然你本機改完 `git push` 也可以。

## 常見狀況

- **線上版打開是空的**：正常，資料沒跟本機同步。用匯出/匯入備份搬過去。
- **股票沒價**：確認代號有加進 `watchlist.json`，而且 App 裡填的代號跟它一致；然後到 Actions 分頁看最近一次有沒有跑成功。
- **排程停了**：repo 超過 60 天沒動作，GitHub 會自動停用定時任務。隨便推一個 commit，或到 Actions → Deploy to GitHub Pages → Run workflow 手動跑一次即可恢復。
- **想改成 private**：免費方案的 Pages 不支援 private repo（需要付費方案）。要走這條再跟我說。
