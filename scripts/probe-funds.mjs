// 第二輪探測：把 MoneyDJ 基金搜尋頁的結構挖出來，找出「送出搜尋後真正列出基金的網址」。
// 用法：Actions → "Probe fund list" → Run workflow，跑完把 log 貼回來。

async function getHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow',
  })
  const buf = await res.arrayBuffer()
  let html = new TextDecoder('utf-8').decode(buf)
  if ((html.match(/\uFFFD/g) || []).length > 20) {
    html = new TextDecoder('big5').decode(buf) // MoneyDJ 多數頁面是 Big5
  }
  return { status: res.status, finalUrl: res.url, html }
}

console.log('════════ A. 搜尋頁的表單與連結結構 ════════')
{
  const { html } = await getHtml('https://www.moneydj.com/funddjx/fundsearch.xdjhtm')

  // 表單：action 決定搜尋送到哪個網址
  const forms = [...html.matchAll(/<form[^>]*>/gi)].map((m) => m[0])
  console.log('\n【表單標籤】共', forms.length, '個')
  forms.forEach((f) => console.log('  ', f.slice(0, 300)))

  // 下拉選單與其選項：能看出可用的篩選條件（例如基金公司、類型）
  const selects = [...html.matchAll(/<select[^>]*name=["']?([\w]+)["']?[^>]*>([\s\S]*?)<\/select>/gi)]
  console.log('\n【下拉選單】共', selects.length, '個')
  for (const s of selects.slice(0, 6)) {
    const opts = [...s[2].matchAll(/<option[^>]*value=["']?([^"'\s>]*)["']?[^>]*>([^<]*)/gi)]
    console.log(`   欄位 ${s[1]}：${opts.length} 個選項`)
    console.log('     前 8 個：', opts.slice(0, 8).map((o) => `${o[1]}=${o[2].trim()}`).join(' | '))
  }

  // 頁面上所有指向 djhtm/xdjhtm 的網址，找出列表頁的線索
  const urls = [...new Set([...html.matchAll(/(?:href|action|src)=["']([^"']*\.x?djhtm[^"']*)["']/gi)].map((m) => m[1]))]
  console.log('\n【頁面內的 djhtm 連結】共', urls.length, '個')
  urls.slice(0, 30).forEach((u) => console.log('  ', u))

  // JavaScript 裡可能藏著送出的目標網址
  const jsUrls = [...new Set([...html.matchAll(/["'](\/?[\w/.-]*\.x?djhtm[^"']*)["']/gi)].map((m) => m[1]))]
  console.log('\n【JS 內出現的 djhtm 路徑】共', jsUrls.length, '個')
  jsUrls.slice(0, 30).forEach((u) => console.log('  ', u))
}

console.log('\n\n════════ B. 試幾個可能的「基金列表 / 排行」頁 ════════')
const LIST_CANDIDATES = [
  'https://www.moneydj.com/funddjx/fundsearchlist.xdjhtm',
  'https://www.moneydj.com/funddjx/fundsearch2.xdjhtm',
  'https://www.moneydj.com/funddj/yb/yb010001.djhtm',
  'https://www.moneydj.com/funddj/yp/yp301000.djhtm',
  'https://www.moneydj.com/funddj/ya/yp011000.djhtm',
  'https://www.moneydj.com/funddjhtm/fundrank.djhtm',
  'https://www.moneydj.com/funddj/yb/yb011000.djhtm',
]
for (const url of LIST_CANDIDATES) {
  try {
    const { status, finalUrl, html } = await getHtml(url)
    const codes = [...new Set([...html.matchAll(/yp010000\.djhtm\?a=([A-Za-z0-9]+)/g)].map((m) => m[1].toUpperCase()))]
    const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || ''
    console.log(`\n${url}`)
    console.log(`   狀態 ${status} → ${finalUrl}`)
    console.log(`   標題：${title.trim().slice(0, 70)}`)
    console.log(`   基金代號連結：${codes.length} 個`, codes.length ? `（例：${codes.slice(0, 8).join(', ')}）` : '')
  } catch (e) {
    console.log(`\n${url}\n   失敗：${e.message}`)
  }
  await new Promise((r) => setTimeout(r, 400))
}

console.log('\n════════ 探測結束，請把以上內容貼回對話 ════════')
