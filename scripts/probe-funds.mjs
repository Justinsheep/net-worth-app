// 第五輪：驗證公司頁 yp303003.djhtm?a=BFC080 能否列出旗下基金，並找出國內投信的對應格式。

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

console.log('════════ A. 境外公司頁（已知格式）════════')
for (const code of ['BFC080', 'BFC079', 'BFC034']) {
  const p = `/funddj/yb/yp303003.djhtm?a=${code}`
  const { finalUrl, html } = await getHtml(BASE + p)
  const codes = fundCodes(html)
  const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 50)
  console.log(`\n${p}`)
  console.log(`   ${finalUrl.includes('404') ? '✗404' : '✓'}　${title}`)
  console.log(`   旗下基金：${codes.length} 檔`, codes.length ? `（例：${codes.slice(0, 8).join(', ')}）` : '')
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n\n════════ B. 國內投信列表頁：所有連結樣本 ════════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP303000.djhtm')
  const all = [...new Set([...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map((m) => m[1]))]
    .filter((h) => /yp30|yb|BFZ|company|comp/i.test(h))
  console.log('  相關連結（前 25 個）：')
  all.slice(0, 25).forEach((l) => console.log('   ', l))
  // BFZ 代號出現在哪些上下文
  const ctx = [...html.matchAll(/.{80}BFZ\d+.{40}/g)].slice(0, 5)
  console.log('\n  BFZ 代號周邊文字（前 5 處）：')
  ctx.forEach((c) => console.log('   ...', c[0].replace(/\s+/g, ' ').trim()))
}

console.log('\n\n════════ C. 猜國內投信公司頁的格式 ════════')
for (const p of [
  '/funddj/yb/yp303002.djhtm?a=BFZ005',
  '/funddj/yb/yp303003.djhtm?a=BFZ005',
  '/funddj/yb/yp303004.djhtm?a=BFZ005',
  '/funddj/ya/yp303002.djhtm?a=BFZ005',
]) {
  try {
    const { finalUrl, html } = await getHtml(BASE + p)
    const codes = fundCodes(html)
    const title = ((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').trim().slice(0, 50)
    console.log(`\n${p}`)
    console.log(`   ${finalUrl.includes('404') ? '✗404' : '✓'}　${title}`)
    if (!finalUrl.includes('404')) console.log(`   旗下基金：${codes.length} 檔`, codes.length ? `（例：${codes.slice(0, 8).join(', ')}）` : '')
  } catch (e) {
    console.log(`\n${p}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
