// 探測：國內基金分類頁是否有分頁（目前每類只抓到第一頁，總共 279 檔偏少）
async function getHtml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, redirect: 'follow' })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) html = new TextDecoder('big5').decode(buf)
  return { finalUrl: res.url, html }
}
const BASE = 'https://www.moneydj.com'
const count = (h) => [...h.matchAll(/yp01000[01]\.djhtm\?a=([A-Za-z0-9]+)"[^>]*class="product_name_fund"/gi)].length

console.log('════ A. 分類頁的分頁線索 ════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP302000.djhtm?a=ET001001')
  console.log('  基金數：', count(html))
  // 找「下一頁 / 頁次」相關連結
  const pager = [...new Set([...html.matchAll(/href=["']?([^"'\s>]*(?:page|Page|PG|pg|next)[^"'\s>]*)/gi)].map((m) => m[1]))]
  console.log('  可能的分頁連結：', pager.length, '個')
  pager.slice(0, 10).forEach((l) => console.log('   ', l))
  // 中文分頁字樣周邊
  for (const kw of ['下一頁', '共', '頁']) {
    const i = html.indexOf(kw)
    if (i > 0) {
      console.log(`\n  "${kw}" 周邊：`, html.slice(Math.max(0, i - 200), i + 150).replace(/\s+/g, ' ').slice(0, 320))
    }
  }
  // 所有 YP302000 連結（可能帶頁碼參數）
  const self = [...new Set([...html.matchAll(/YP302000\.djhtm\?([^"'\s>]+)/gi)].map((m) => m[1]))]
  console.log('\n  頁面內 YP302000 參數組合：', self.length, '種')
  self.slice(0, 12).forEach((s) => console.log('   ', s))
}

console.log('\n════ B. 試常見分頁參數 ════')
for (const q of ['&b=2', '&page=2', '&P=2', '&pg=2', '&c=2', '&b=1&c=2']) {
  try {
    const { html } = await getHtml(BASE + '/funddj/yb/YP302000.djhtm?a=ET001001' + q)
    console.log(`  ?a=ET001001${q} → ${count(html)} 檔`)
  } catch (e) {
    console.log(`  ?a=ET001001${q} → 失敗 ${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

console.log('\n════ C. 各分類目前抓到幾檔 ════')
{
  const { html } = await getHtml(BASE + '/funddj/yb/YP301000.djhtm')
  const cats = [...new Set([...html.matchAll(/YP302000\.djhtm\?a=(ET\d+)/gi)].map((m) => m[1].toUpperCase()))]
  for (const cat of cats.slice(0, 8)) {
    const { html: h } = await getHtml(BASE + `/funddj/yb/YP302000.djhtm?a=${cat}`)
    console.log(`  ${cat} → ${count(h)} 檔`)
    await new Promise((r) => setTimeout(r, 250))
  }
}
console.log('\n════ 探測結束 ════')
