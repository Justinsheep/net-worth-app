// 探測：分類頁 YP302000 到底有什麼？順便試官方 SITCA 的國內基金清單。
async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, redirect: 'follow' })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return { finalUrl: res.url, html, status: res.status }
}
const BASE = 'https://www.moneydj.com'

console.log('════ A. 分類頁 YP302000 的實際內容 ════')
{
  const { html, finalUrl } = await getHtml(BASE + '/funddj/yb/YP302000.djhtm?a=ET001001')
  console.log('  最終網址：', finalUrl)
  console.log('  頁面大小：', html.length)
  console.log('  標題：', ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim())
  // 任何指向基金明細的連結（不限 class）
  const anyFund = [...new Set([...html.matchAll(/yp01000\d\.djhtm\?a=([A-Za-z0-9]+)/gi)].map((m) => m[1].toUpperCase()))]
  console.log('  任何 yp01000x 連結：', anyFund.length, '個', anyFund.slice(0, 8).join(', '))
  // 頁面主體片段，看看是不是空殼（靠 JS 載入）
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  console.log('  純文字內容（前 400 字）：', text.slice(0, 400))
  // 有沒有 iframe（資料可能在裡面）
  const iframes = [...html.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1])
  console.log('  iframe：', iframes.length, '個', iframes.slice(0, 5).join(' | '))
}

console.log('\n\n════ B. 已知可用的國內基金排行頁，還有沒有別的 ════')
const RANKS = [
  '/funddj/yp/YP081008.djhtm',      // 四四三三（已用，195）
  '/funddj/yb/YP081010.djhtm',      // 人氣排行（已用，100）
  '/funddj/yl/YP081009.djhtm',
  '/funddj/ya/yp082000.djhtm',
  '/funddj/ya/yp081001.djhtm',
  '/funddj/ya/YP051000.djhtm',
  '/funddj/ya/YP407000.djhtm',
  '/funddj/ya/YP409040.djhtm',
  '/funddj/yb/YP081010.djhtm?A=1',
  '/funddj/yp/YP081008.djhtm?A=1&B=Y',
]
for (const p of RANKS) {
  try {
    const { html, finalUrl } = await getHtml(BASE + p)
    const n = [...new Set([...html.matchAll(/yp01000[01]\.djhtm\?a=([A-Za-z0-9]+)"[^>]*class="product_name_fund"/gi)].map((m) => m[1]))].length
    console.log(`  ${p} → ${finalUrl.includes('404') ? '404' : n + ' 檔'}`)
  } catch (e) {
    console.log(`  ${p} → 失敗 ${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 250))
}

console.log('\n\n════ C. 官方 SITCA 國內基金清單 ════')
for (const u of [
  'https://www.sitca.org.tw/ROC/Industry/IN2421.aspx?PGMID=FR001',
  'https://www.sitca.org.tw/ROC/Industry/IN2422.aspx?PGMID=FR002',
]) {
  try {
    const { html, status } = await getHtml(u)
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    console.log(`\n  ${u}`)
    console.log(`    狀態 ${status}，大小 ${html.length}`)
    console.log(`    內容前 200 字：${text.slice(0, 200)}`)
  } catch (e) {
    console.log(`\n  ${u}\n    失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}
console.log('\n════ 探測結束 ════')
