// 探測：找出「國內投信」旗下基金的頁面格式（境外的已經確認可用並實作了）。
async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, redirect: 'follow' })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return { finalUrl: res.url, html }
}
const BASE = 'https://www.moneydj.com'
const title = (h) => ((h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 55)
const namedFunds = (h) => [...h.matchAll(/yp01000[01]\.djhtm\?a=([A-Za-z0-9]+)"[^>]*class="product_name_fund"[^>]*>([^<]+)</gi)]

console.log('════ 國內投信公司代號 ════')
const { html: listHtml } = await getHtml(BASE + '/funddj/yb/YP303000.djhtm')
const bfz = [...new Set([...listHtml.matchAll(/(BFZ\d+)/gi)].map((m) => m[1].toUpperCase()))]
console.log('  BFZ 代號：', bfz.length, '個', bfz.slice(0, 12).join(', '))

console.log('\n════ 試國內投信旗下基金頁 ════')
const co = bfz[0] || 'BFZ002'
for (const p of [
  `/funddj/yp/yp303004.djhtm?a=${co}&b=1`,
  `/funddj/yp/yp303002.djhtm?a=${co}&b=1`,
  `/funddj/yb/yp303002.djhtm?a=${co}&b=1`,
  `/funddj/yp/yp053000.djhtm?a=${co}`,
  `/funddj/yp/yp303000.djhtm?a=${co}&b=1`,
]) {
  try {
    const { finalUrl, html } = await getHtml(BASE + p)
    const rows = namedFunds(html)
    console.log(`\n${p}`)
    console.log(`   ${finalUrl.includes('404') ? '✗404' : '✓'}　${title(html)}`)
    console.log(`   有名稱的基金：${rows.length} 檔`, rows.length ? `（例：${rows.slice(0, 3).map((r) => r[1] + '=' + r[2].trim().slice(0, 18)).join(' | ')}）` : '')
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}
console.log('\n════ 探測結束 ════')
