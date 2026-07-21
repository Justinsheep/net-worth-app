// 第七輪：(A) 看清楚基金連結周邊的 HTML 才能抓中文名稱
//         (B) 國內基金改從「國內基金搜尋」的分類代號(ET...)切入
//         (C) 估算境外公司的涵蓋率

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

console.log('════════ A. 基金連結周邊的原始 HTML（為了抓中文名稱）════════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/yp303004.djhtm?a=BFC034')
  const idx = html.search(/GAZ33/i)
  if (idx > 0) {
    console.log('  GAZ33 周邊 600 字元：')
    console.log('  ---8<---')
    console.log(html.slice(Math.max(0, idx - 300), idx + 300).replace(/\s+/g, ' '))
    console.log('  ---8<---')
  }
  // 也把所有 <a> 標籤含 djhtm?a= 的完整樣子印幾個
  const anchors = [...html.matchAll(/<a[^>]*djhtm\?a=[^>]*>[\s\S]{0,80}?<\/a>/gi)].slice(0, 6)
  console.log('\n  完整連結標籤樣本：')
  anchors.forEach((a) => console.log('   ', a[0].replace(/\s+/g, ' ').slice(0, 200)))
}

console.log('\n\n════════ B. 國內基金：從分類代號 ET... 切入 ════════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP301000.djhtm')
  const ets = [...new Set([...html.matchAll(/\?a=(ET\d+)/gi)].map((m) => m[1].toUpperCase()))]
  console.log('  分類代號：', ets.length, '個', ets.slice(0, 10).join(', '))
  // ET 代號出現在什麼連結裡
  const etLinks = [...new Set([...html.matchAll(/href=["']([^"']*\?a=ET\d+[^"']*)["']/gi)].map((m) => m[1]))]
  console.log('  分類連結樣本：')
  etLinks.slice(0, 5).forEach((l) => console.log('   ', l))

  if (etLinks.length) {
    const testUrl = etLinks[0].startsWith('http') ? etLinks[0] : BASE + (etLinks[0].startsWith('/') ? '' : '/funddj/yb/') + etLinks[0]
    console.log('\n  試打開第一個分類：', testUrl)
    const r = await getHtml(testUrl)
    const codes = fundCodes(r.html)
    console.log('   ', title(r.html))
    console.log(`    基金：${codes.length} 檔`, codes.length ? `（例：${codes.slice(0, 10).join(', ')}）` : '')
  }
}

console.log('\n\n════════ C. 境外公司涵蓋率抽樣 ════════')
let total = 0
for (const code of ['BFC079', 'BFC163', 'BFC213', 'BFC161', 'BFC205', 'BFC187']) {
  const { html } = await getHtml(BASE + `/funddj/yb/yp303004.djhtm?a=${code}`)
  const n = fundCodes(html).length
  total += n
  console.log(`  ${code}：${n} 檔　${title(html).slice(0, 30)}`)
  await new Promise((r) => setTimeout(r, 300))
}
console.log('  抽樣 6 家共', total, '檔')

console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
