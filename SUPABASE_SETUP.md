# Google 登入 + 雲端同步設定

跟著做一次就好，之後手機和電腦登入同一個 Google 帳號，資料就會自動同步。過程分五部分，大約 20 分鐘。

> 你的網址（設定時會用到）：
> - 網站：`https://justinsheep.github.io/net-worth-app/`
> - 網站來源：`https://justinsheep.github.io`
> - 本機開發：`http://localhost:5173`

---

## A. 建立 Supabase 專案

1. 到 supabase.com → 用 GitHub 或 Google 登入 → **New project**。
2. 取個名字、設一組資料庫密碼（隨便設、記起來即可）、地區選離台灣近的（例如 Singapore）→ 建立，等它跑好（約 1 分鐘）。
3. 左下 **Project Settings → API**，記下兩個東西（等等要貼進程式）：
   - **Project URL**（像 `https://abcdxyz.supabase.co`）
   - **anon public** 金鑰（很長那串）

## B. 建資料表與權限（複製貼上就好）

到左邊 **SQL Editor → New query**，把下面整段貼上、按 **Run**：

```sql
create table if not exists public.holdings (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.holdings enable row level security;
create policy "own holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.snapshots (
  user_id uuid not null references auth.users on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.snapshots enable row level security;
create policy "own snapshots" on public.snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

這會建好資料表，並設好「每個人只能存取自己的資料」的規則（RLS）。

## C. 在 Google Cloud 開一組 OAuth 憑證

1. 先到 Supabase **Authentication → Providers → Google**，把它展開，**複製那個 Callback URL**（格式像 `https://abcdxyz.supabase.co/auth/v1/callback`）。先擺著等等要用。
2. 到 Google Cloud Console（console.cloud.google.com）→ 建一個新專案。
3. 找到 **OAuth 同意畫面（OAuth consent screen）**：User Type 選 **External** → 填 App 名稱、你的信箱 → 在 **Test users** 把你自己的 Google 信箱加進去（沒發布前只有測試使用者能登入）。
4. 到 **Credentials → Create Credentials → OAuth client ID** → Application type 選 **Web application**：
   - **Authorized JavaScript origins** 加這三個：
     - `https://justinsheep.github.io`
     - `https://abcdxyz.supabase.co`（換成你的 Supabase 網址）
     - `http://localhost:5173`
   - **Authorized redirect URIs** 貼上第 1 步複製的 Supabase Callback URL（`https://abcdxyz.supabase.co/auth/v1/callback`）。
5. 按 Create，記下 **Client ID** 和 **Client Secret**。

## D. 在 Supabase 打開 Google 登入 + 設定網址

1. **Authentication → Providers → Google** → 打開 Enable，把剛剛的 Client ID、Client Secret 貼進去 → Save。
2. **Authentication → URL Configuration**：
   - **Site URL** 設成 `https://justinsheep.github.io/net-worth-app/`
   - **Redirect URLs** 加入這兩個（按 Add URL）：
     - `https://justinsheep.github.io/net-worth-app/`
     - `http://localhost:5173`

## E. 把金鑰貼進程式、推上去

1. 打開專案裡的 `src/config.js`，把 A 步驟記下的兩個值填進去：
   ```js
   export const SUPABASE_URL = 'https://abcdxyz.supabase.co'
   export const SUPABASE_ANON_KEY = '你的 anon public 金鑰'
   ```
2. 推上去：
   ```powershell
   git add -A
   git commit -m "enable google login"
   git push
   ```
3. 部署好後打開網站，右上會出現「用 Google 登入以同步」。第一次登入會把你這台已有的資料上傳；之後在別台登入同一個帳號，就會拉下來、雙向同步。

---

## 說明與常見狀況

- **anon 金鑰放進公開 repo 安全嗎？** 安全。它是設計成公開的，真正保護資料的是 B 步驟的 RLS——別人就算有金鑰，也只能存取自己帳號的資料。
- **不想設定也能用**：`config.js` 留空時 App 就是純本機模式，沒有登入、只存這台，一切照舊。
- **登入後轉圈或報錯**：多半是網址沒對齊。確認 C 的 redirect URI 是「Supabase 的 callback」、D 的 Redirect URLs 有你的網站網址，且 origins 有 `https://justinsheep.github.io`。
- **同步規則**：同一筆資料兩邊都改，以「較晚改的」為準。刪除也會同步（其他裝置下次同步時一起移除）。
