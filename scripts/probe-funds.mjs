// 第四輪：確認「基金公司 → 旗下基金列表」這條路徑的網址格式。
// 已知 YP303000 = 投信列表(BFZ...)、YP303001 = 境外發行公司列表(BFC...)

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
const isFundCode = (c) => /^[A-Z]{2,}\d/.test(c) && !/^BF[ZC]/.test(c) // 排除公司代號

console.log('════════ A. 公司列表頁：連結長什麼樣 ════════')
for (const p of ['/funddj/yb/YP303000.djhtm', '/funddj/yb/YP303001.djhtm']) {
  const { html } = await getHtml(BASE + p)
  console.log(`\n${p}`)
  // 印出含公司代號的原始連結，看出網址格式
  const links = [...new Set([...html.matchAll(/<a[^>]+href=["']([^"']*(?:BF[ZC]\w+)[^"']*)["']/gi)].map((m) => m[1]))]
  console.log('  含公司代號的連結（前 6 個）：')
  links.slice(0, 6).forEach((l) => console.log('   ', l))
  console.log('  總共', links.length, '個')
}

console.log('\n\n════════ B. 試著打開一家公司的頁面，看有沒有列出旗下基金 ════════')
// 用第三輪看到的實際公司代號測試
const COMPANY_TESTS = [
  '/funddj/yb/yp303000.djhtm?a=BFZ005',
  '/funddj/yb/YP303001.djhtm?a=BFC080',
  '/funddj/ya/yp303001.djhtm?a=BFZ005',
  '/funddj/yb/yp081020.djhtm?a=BFZ005',
  '/funddj/yp/yp303000.djhtm?a=BFZ005',
]
for (const p of COMPANY_TESTS) {
  try {
    const { finalUrl, html } = await getHtml(BASE + p)
    const is404 = finalUrl.includes('404.htm')
    const codes = [...new Set([...html.matchAll(/\.djhtm\?a=([A-Za-z]{2,}\d[A-Za-z0-9]*)/gi)].map((m) => m[1].toUpperCase()))].filter(isFundCode)
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 60)
    console.log(`\n${p}`)
    console.log(`   ${is404 ? '✗ 404' : '✓'}　${title}`)
    if (!is404) console.log(`   旗下基金代號：${codes.length} 個`, codes.length ? `（例：${codes.slice(0, 10).join(', ')}）` : '')
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n\n════════ C. 「四四三三法則」頁能不能翻更多（195 檔是目前最多的）════════')
for (const q of ['', '?selRR=1', '?selRR=2', '?selRR=3', '?selRR=4', '?selRR=5']) {
  const { html } = await getHtml(BASE + '/funddj/yp/YP081008.djhtm' + q)
  const codes = [...new Set([...html.matchAll(/\.djhtm\?a=([A-Za-z]{2,}\d[A-Za-z0-9]*)/gi)].map((m) => m[1].toUpperCase()))].filter(isFundCode)
  console.log(`  YP081008.djhtm${q || '(無參數)'} → ${codes.length} 檔`)
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
