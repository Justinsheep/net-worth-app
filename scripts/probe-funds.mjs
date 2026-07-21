// 第三輪探測：掃描搜尋頁上發現的所有相關頁面，找出真正「列出一堆基金」的那一個。
// 用法：Actions → "Probe fund list" → Run workflow，跑完把 log 貼回來。

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow',
  })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return { status: res.status, finalUrl: res.url, html }
}

const BASE = 'https://www.moneydj.com'
const TARGETS = [
  '/funddj/yb/YP301000.djhtm',   // 國內基金搜尋
  '/funddj/yb/YP301001.djhtm',
  '/funddj/yb/YP303000.djhtm',
  '/funddj/yb/YP303001.djhtm',
  '/funddj/yb/YP304000.djhtm',
  '/funddj/ys/YP305000.djhtm',
  '/funddj/ys/YP305001.djhtm',
  '/funddj/yl/YP305103.djhtm',
  '/funddj/yl/YP305104.djhtm',
  '/funddj/yb/yp081020.djhtm?a=1',
  '/funddj/yb/yp081020.djhtm?a=2',
  '/funddj/yb/yp081020.djhtm?a=3',
  '/funddj/ya/YP401000.djhtm',
  '/funddj/ya/YP401001.djhtm',
  '/funddj/ya/YP401002.djhtm',
  '/funddj/yb/YP081010.djhtm',
  '/funddj/yp/YP081008.djhtm',
  '/funddj/ya/yp306.djhtm',
  '/funddj/ya/yp307.djhtm',
  '/funddj/ya/yp308.djhtm',
  '/funddj/ya/yp081003.djhtm',
  '/funddj/ya/yp081004.djhtm',
]

// 基金代號可能出現在多種連結形式裡，放寬比對：任何 .djhtm?a=英數代號 都算候選
function extractCodes(html) {
  const codes = new Set()
  for (const m of html.matchAll(/\.djhtm\?a=([A-Za-z]{2,}\d[A-Za-z0-9]*)/gi)) codes.add(m[1].toUpperCase())
  return [...codes]
}

const found = []
for (const p of TARGETS) {
  const url = BASE + p
  try {
    const { status, finalUrl, html } = await getHtml(url)
    const is404 = finalUrl.includes('404.htm')
    const codes = extractCodes(html)
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 60)
    console.log(`\n${p}`)
    console.log(`   ${is404 ? '✗ 404' : '✓ ' + status}　${title}`)
    if (!is404) {
      console.log(`   基金代號：${codes.length} 個`, codes.length ? `（例：${codes.slice(0, 10).join(', ')}）` : '')
      if (codes.length >= 5) found.push({ p, count: codes.length, title })
      // 有下拉選單代表可以用參數篩選，印出來看看有哪些可選值
      const selects = [...html.matchAll(/<select[^>]*name=["']?([\w]+)["']?[^>]*>([\s\S]*?)<\/select>/gi)]
      for (const s of selects.slice(0, 3)) {
        const opts = [...s[2].matchAll(/<option[^>]*value=["']?([^"'\s>]*)["']?[^>]*>([^<]*)/gi)]
        if (opts.length > 2) {
          console.log(`   下拉 ${s[1]}：${opts.length} 選項，例 ${opts.slice(1, 6).map((o) => `${o[1]}=${o[2].trim()}`).join(' | ')}`)
        }
      }
    }
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n\n════════ 結論：有列出基金的頁面 ════════')
if (found.length) {
  found.sort((a, b) => b.count - a.count)
  found.forEach((f) => console.log(`  ${f.count} 檔　${f.p}　${f.title}`))
} else {
  console.log('  沒有任何頁面直接列出基金清單（可能都是靠 JS 動態載入）')
}
console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
