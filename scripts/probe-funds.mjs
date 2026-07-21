// 第六輪：yp303004.djhtm = 「境外發行公司旗下基金淨值」，用正確的 BFC 代號驗證。
// 另外找國內投信的對應頁（線索：YP053000_FB000001.djhtm 這種格式）。

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow',
  })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return { finalUrl: res.url, html }
}
const BASE = 'https://www.moneydj.com'
const isFundCode = (c) => /^[A-Z]{2,}\d/.test(c) && !/^BF[ZC]/.test(c)
const fundCodes = (html) =>
  [...new Set([...html.matchAll(/\.djhtm\?a=([A-Za-z]{2,}\d[A-Za-z0-9]*)/gi)].map((m) => m[1].toUpperCase()))].filter(isFundCode)
const title = (html) => ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 55)

console.log('════════ A. 境外公司旗下基金淨值頁（用 BFC 代號）════════')
for (const code of ['BFC080', 'BFC034', 'BFC169', 'BFC186']) {
  const p = `/funddj/yb/yp303004.djhtm?a=${code}`
  const { html } = await getHtml(BASE + p)
  const codes = fundCodes(html)
  console.log(`\n${p}`)
  console.log(`   ${title(html)}`)
  console.log(`   旗下基金：${codes.length} 檔`, codes.length ? `（例：${codes.slice(0, 10).join(', ')}）` : '')
  // 順便看看基金名稱抓不抓得到（中文名是搜尋建議的關鍵）
  if (codes.length) {
    const rows = [...html.matchAll(/yp010000\.djhtm\?a=([A-Za-z0-9]+)[^>]*>([^<]{2,60})</gi)].slice(0, 5)
    console.log('   名稱樣本：')
    rows.forEach((r) => console.log(`     ${r[1].toUpperCase()} → ${r[2].trim()}`))
  }
  await new Promise((r) => setTimeout(r, 350))
}

console.log('\n\n════════ B. 國內投信：找公司代號與旗下基金頁 ════════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP303000.djhtm')
  // 找 YP053000_XXXX 這種格式的連結
  const comp = [...new Set([...html.matchAll(/YP053000_([A-Za-z0-9]+)\.djhtm/gi)].map((m) => m[1].toUpperCase()))]
  console.log('  YP053000_ 型連結：', comp.length, '個', comp.slice(0, 12).join(', '))
  // 頁面上所有 .djhtm 連結，看國內投信怎麼連
  const links = [...new Set([...html.matchAll(/href=["']([^"']*\.djhtm[^"']*)["']/gi)].map((m) => m[1]))]
  console.log('  頁面所有 djhtm 連結：', links.length, '個（前 20）')
  links.slice(0, 20).forEach((l) => console.log('   ', l))
}

console.log('\n\n════════ C. 試國內投信旗下基金頁的可能格式 ════════')
for (const p of [
  '/funddj/yb/YP053000_FB000001.djhtm',
  '/funddj/yb/yp303002.djhtm?a=BFZ002',
  '/funddj/yb/yp303005.djhtm?a=BFZ002',
  '/funddj/yb/yp303006.djhtm?a=BFZ002',
]) {
  try {
    const { finalUrl, html } = await getHtml(BASE + p)
    const codes = fundCodes(html)
    console.log(`\n${p}`)
    console.log(`   ${finalUrl.includes('404') ? '✗404' : '✓'}　${title(html)}`)
    if (!finalUrl.includes('404')) console.log(`   基金：${codes.length} 檔`, codes.length ? `（例：${codes.slice(0, 10).join(', ')}）` : '')
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
