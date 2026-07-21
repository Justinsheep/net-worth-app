// 探測：國內基金改從「國內基金搜尋」的分類代號(ET...)切入，並直接看原始 HTML 的連結寫法。
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

console.log('════ A. 國內基金搜尋頁：ET 代號的連結原文 ════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP301000.djhtm')
  const i = html.search(/ET001001/i)
  if (i > 0) {
    console.log('  ET001001 周邊 700 字元：')
    console.log('  ---8<---')
    console.log(html.slice(Math.max(0, i - 400), i + 300).replace(/\s+/g, ' '))
    console.log('  ---8<---')
  }
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map((m) => m[0])
  console.log('\n  表單：', forms.length, '個')
  forms.slice(0, 3).forEach((f) => console.log('   ', f.slice(0, 250)))
}

console.log('\n\n════ B. 試用分類代號列出國內基金 ════')
for (const p of [
  '/funddj/yb/YP301000.djhtm?a=ET001001',
  '/funddj/yp/yp301001.djhtm?a=ET001001',
  '/funddj/yb/yp301002.djhtm?a=ET001001',
  '/funddj/ya/YP401000.djhtm?a=ET001001',
  '/funddj/yp/yp010000.djhtm?a=ET001001',
]) {
  try {
    const { finalUrl, html } = await getHtml(BASE + p)
    const rows = namedFunds(html)
    console.log(`\n${p}`)
    console.log(`   ${finalUrl.includes('404') ? '✗404' : '✓'}　${title(html)}`)
    console.log(`   有名稱的基金：${rows.length} 檔`, rows.length ? `（例：${rows.slice(0, 3).map((r) => r[1] + '=' + r[2].trim().slice(0, 20)).join(' | ')}）` : '')
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n\n════ C. 已知有國內基金的頁面，能抓到名稱嗎 ════')
for (const p of ['/funddj/yp/YP081008.djhtm', '/funddj/yb/YP081010.djhtm', '/funddj/ya/YP401000.djhtm', '/funddj/ya/YP401002.djhtm']) {
  const { html } = await getHtml(BASE + p)
  const rows = namedFunds(html)
  console.log(`  ${p} → ${rows.length} 檔`, rows.length ? `（例：${rows.slice(0, 2).map((r) => r[1] + '=' + r[2].trim().slice(0, 20)).join(' | ')}）` : '')
  await new Promise((r) => setTimeout(r, 300))
}
console.log('\n════ 探測結束 ════')
