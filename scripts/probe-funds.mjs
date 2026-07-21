// 一次性的探測腳本：找出 MoneyDJ 上「可以列出一批基金」的網址長什麼樣。
//
// 為什麼需要這支：開發環境沒有對外網路，沒辦法直接看 MoneyDJ 的頁面結構，
// 但 GitHub Actions 的機器可以連外網。所以讓它去試幾個最可能的網址，
// 把回應的關鍵特徵印出來，再依實際結果寫正式的抓取邏輯。
//
// 用法：在 GitHub 的 Actions 分頁手動觸發 "Probe fund list" 這個 workflow，
// 跑完把 log 整段貼回來即可。

const CANDIDATES = [
  // 基金搜尋 / 列表頁的幾種可能形式
  'https://www.moneydj.com/funddjx/fundsearch.xdjhtm',
  'https://www.moneydj.com/funddjx/fundsearch.xdjhtm?a=1',
  'https://www.moneydj.com/funddj/ya/yp010000.djhtm?a=ACFT01',
  // 常見的「基金排行 / 總覽」型頁面
  'https://www.moneydj.com/funddj/yp/yp011000.djhtm',
  'https://www.moneydj.com/funddj/yp/yp012000.djhtm',
  'https://www.moneydj.com/funddj/yb/yb010000.djhtm',
  // 基智網（SITCA 與證交所合辦的官方基金資訊平台）
  'https://www.fundclear.com.tw/',
  // 投信投顧公會（SITCA）淨值查詢
  'https://www.sitca.org.tw/',
]

// 從 HTML 裡撈出所有「基金明細頁」的連結，這是最能證明「這頁列了一堆基金」的證據
function findFundLinks(html) {
  const out = new Set()
  const re = /yp010000\.djhtm\?a=([A-Za-z0-9]+)/g
  let m
  while ((m = re.exec(html))) out.add(m[1])
  return [...out]
}

async function probe(url) {
  console.log('\n──────────────────────────────────────────')
  console.log('嘗試：', url)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      redirect: 'follow',
    })
    console.log('  HTTP 狀態：', res.status)
    console.log('  最終網址：', res.url)
    const ct = res.headers.get('content-type') || ''
    console.log('  內容型態：', ct)
    if (!res.ok) return

    const buf = await res.arrayBuffer()
    // MoneyDJ 這類老網站常用 Big5，先試 UTF-8，看起來像亂碼就改用 Big5 解
    let html = new TextDecoder('utf-8').decode(buf)
    const looksGarbled = (html.match(/\uFFFD/g) || []).length > 20
    if (looksGarbled) {
      try {
        html = new TextDecoder('big5').decode(buf)
        console.log('  編碼：Big5（UTF-8 解出來是亂碼）')
      } catch {
        console.log('  編碼：UTF-8（Big5 解碼器不支援）')
      }
    } else {
      console.log('  編碼：UTF-8')
    }

    console.log('  頁面大小：', html.length, '字元')
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)
    if (title) console.log('  標題：', title[1].trim().slice(0, 80))

    const links = findFundLinks(html)
    console.log('  找到基金明細連結：', links.length, '個')
    if (links.length) console.log('  前 10 個代號：', links.slice(0, 10).join(', '))

    // 有沒有下拉選單（常用來選基金公司/分類），這通常是列表頁的入口
    const selects = html.match(/<select[^>]*name=["']?(\w+)/gi)
    if (selects) console.log('  頁面上的下拉選單欄位：', [...new Set(selects)].slice(0, 8).join(' | '))

    // 有沒有表單送出的目標，能看出真正的查詢網址
    const forms = html.match(/<form[^>]*action=["']([^"']+)["']/gi)
    if (forms) console.log('  表單送出目標：', [...new Set(forms)].slice(0, 5).join(' | '))
  } catch (e) {
    console.log('  失敗：', e.message)
  }
}

for (const url of CANDIDATES) {
  await probe(url)
  await new Promise((r) => setTimeout(r, 500))
}

console.log('\n──────────────────────────────────────────')
console.log('探測結束。請把以上完整內容貼回對話。')
