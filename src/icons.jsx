// 手繪的扁平單色小圖示庫（不使用任何外部圖庫/商標，避免版權問題）。
// 每個都是 24x24 viewBox、單一顏色（用 currentColor），風格盡量圓潤可愛。

const P = ({ children }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">{children}</svg>
)

export const ICON_DEFS = {
  coin: () => <P><circle cx="12" cy="12" r="9" opacity="0.18" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7.2c-2 0-3.3 1-3.3 2.1 0 1 .9 1.5 2.4 1.8l1 .2c1.7.3 2.6.9 2.6 2 0 1.3-1.3 2.2-3 2.2-1.5 0-2.8-.6-3.3-1.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><path d="M12 6v1.1M12 16.9V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></P>,
  banknote: () => <P><rect x="2.5" y="6.5" width="19" height="11" rx="2.2" opacity="0.16" /><rect x="2.5" y="6.5" width="19" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="6" cy="12" r="0.9" /><circle cx="18" cy="12" r="0.9" /></P>,
  piggy: () => <P><ellipse cx="12" cy="13.5" rx="8" ry="5.5" opacity="0.18" /><ellipse cx="12" cy="13.5" rx="8" ry="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M18.5 12.3 21 11l-.6 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="15.3" cy="12" r="0.9" /><rect x="9.5" y="7.8" width="3" height="1.6" rx="0.8" /><path d="M6.5 17.5 5.6 19.3M15 17.7l.7 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></P>,
  wallet: () => <P><rect x="2.7" y="6.5" width="18.6" height="13" rx="2.4" opacity="0.16" /><rect x="2.7" y="6.5" width="18.6" height="13" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2.7 10.2h18.6" stroke="currentColor" strokeWidth="1.6" /><circle cx="16.5" cy="14.3" r="1.3" /></P>,
  bank: () => <P><path d="M12 3 21 8H3z" opacity="0.18" /><path d="M12 3 21 8H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M5 8v9.5M9.3 8v9.5M14.7 8v9.5M19 8v9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M3.5 20.5h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></P>,
  gem: () => <P><path d="M7 4h10l3.5 5L12 21 3.5 9Z" opacity="0.18" /><path d="M7 4h10l3.5 5L12 21 3.5 9Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M3.5 9h17M9 4l-2 5 5 12 5-12-2-5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></P>,
  safe: () => <P><rect x="3" y="3" width="18" height="18" rx="2.6" opacity="0.16" /><rect x="3" y="3" width="18" height="18" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="12" cy="12" r="0.9" /><path d="M12 8.6V6M17.5 6.5l-1.8 1.8M6.5 17.5l1.8-1.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></P>,
  card: () => <P><rect x="2.5" y="5.5" width="19" height="13" rx="2.4" opacity="0.16" /><rect x="2.5" y="5.5" width="19" height="13" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="2.5" y="9" width="19" height="2.6" /><rect x="5.5" y="14" width="5" height="1.6" rx="0.8" /></P>,
  chartUp: () => <P><rect x="4" y="13" width="3.2" height="7" rx="0.8" opacity="0.7" /><rect x="10.4" y="9" width="3.2" height="11" rx="0.8" opacity="0.85" /><rect x="16.8" y="5" width="3.2" height="15" rx="0.8" /><path d="M4 8.5 9 4.5l3 2.7 6-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" /></P>,
  percent: () => <P><circle cx="7.5" cy="7.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="16.5" cy="16.5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M6 18 18 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></P>,
  calculator: () => <P><rect x="4.5" y="2.5" width="15" height="19" rx="2.4" opacity="0.16" /><rect x="4.5" y="2.5" width="15" height="19" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="7" y="5" width="10" height="4" rx="0.8" /><circle cx="8" cy="13" r="1" /><circle cx="12" cy="13" r="1" /><circle cx="16" cy="13" r="1" /><circle cx="8" cy="17" r="1" /><circle cx="12" cy="17" r="1" /><circle cx="16" cy="17" r="1" /></P>,
  house: () => <P><path d="M12 3.5 21 11v9.5H3V11Z" opacity="0.18" /><path d="M12 3.5 21 11v9.5H3V11Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><rect x="9.5" y="13.5" width="5" height="7" rx="0.6" /></P>,
  shield: () => <P><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" opacity="0.18" /><path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.5 12.2l2.3 2.3 4.5-4.7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></P>,
  star: () => <P><path d="M12 2.8l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9l6-.7Z" opacity="0.2" /><path d="M12 2.8l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9l6-.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></P>,
  chest: () => <P><path d="M3.5 10a8.5 5 0 0 1 17 0v7.5a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 17.5Z" opacity="0.18" /><path d="M3.5 10a8.5 5 0 0 1 17 0v7.5a1.6 1.6 0 0 1-1.6 1.6H5.1A1.6 1.6 0 0 1 3.5 17.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.6" /><rect x="10.3" y="9.2" width="3.4" height="3" rx="0.7" /></P>,
  key: () => <P><circle cx="7.5" cy="14.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" /><path d="M10.5 11.7 20 2.2M17 5.2l2 2M14.4 7.8l1.8 1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></P>,
  umbrella: () => <P><path d="M3 11a9 9 0 0 1 18 0Z" opacity="0.18" /><path d="M3 11a9 9 0 0 1 18 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 11v8a2 2 0 0 1-3.2 1.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 2.5v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></P>,
  rocket: () => <P><path d="M12 2.5c3 2 4.3 5.3 4.3 8.7 0 2-.6 3.8-1.6 5.3H9.3c-1-1.5-1.6-3.3-1.6-5.3 0-3.4 1.3-6.7 4.3-8.7Z" opacity="0.18" /><path d="M12 2.5c3 2 4.3 5.3 4.3 8.7 0 2-.6 3.8-1.6 5.3H9.3c-1-1.5-1.6-3.3-1.6-5.3 0-3.4 1.3-6.7 4.3-8.7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><circle cx="12" cy="10.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M9 16.5 6.8 21l2.7-1.3M15 16.5l2.2 4.5-2.7-1.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></P>,
  target: () => <P><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="1.8" /></P>,
  clock: () => <P><circle cx="12" cy="12" r="9" opacity="0.16" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7v5.3l3.6 2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></P>,
  goldbar: () => <P><path d="M6 8h12l2.5 8H3.5Z" opacity="0.18" /><path d="M6 8h12l2.5 8H3.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8.3 8 6.6 16M15.7 8l1.7 8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></P>,
  scale: () => <P><path d="M12 3v18M6 21h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M12 5 5 9l1 4.5a5 5 0 0 0 4 0z" opacity="0.18" /><path d="M12 5 5 9l1 4.5a5 5 0 0 0 4 0z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M12 5l7 4-1 4.5a5 5 0 0 1-4 0z" opacity="0.18" /><path d="M12 5l7 4-1 4.5a5 5 0 0 1-4 0z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></P>,
  car: () => <P><path d="M4.5 14.5 6 9.8a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 9.8l1.5 4.7" opacity="0.18" /><path d="M3.5 14.5h17v3.2a1 1 0 0 1-1 1H16a1 1 0 0 1-1-1V17H9v.7a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M4.5 14.5 6 9.8a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 9.8l1.5 4.7Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="7" cy="14.8" r="1.3" /><circle cx="17" cy="14.8" r="1.3" /></P>,
  cap: () => <P><path d="M12 5 21 9l-9 4-9-4Z" opacity="0.18" /><path d="M12 5 21 9l-9 4-9-4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M6.5 11v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M21 9v5.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></P>,
}

// 挑選面板顯示的圖示（精簡成最常用的一組，選起來更快）。
// 註：ICON_DEFS 仍保留全部定義，分類/子分類的預設圖示照常運作，只是不全部列進挑選面板。
export const ICON_LIST = [
  ['coin', '金幣'], ['banknote', '鈔票'], ['piggy', '撲滿'], ['wallet', '皮夾'],
  ['bank', '銀行'], ['card', '信用卡'], ['chartUp', '上漲'], ['house', '房屋'],
  ['car', '車輛'], ['goldbar', '金條'],
]

// 各分類（可含子分類）沒有自選圖示時的預設圖示
export const DEFAULT_ICON = {
  tw_stock: 'chartUp',
  crypto: 'coin',
  cash: 'wallet',
  bank: 'bank',
  debt: 'scale',
}
const DEFAULT_ICON_BY_SUBTYPE = {
  'crypto:exchange': 'safe',
  'debt:mortgage': 'house',
  'debt:car': 'car',
  'debt:student': 'cap',
  'debt:credit': 'card',
  'debt:other': 'scale',
}

export function defaultIconFor(category, subtype) {
  if (subtype && DEFAULT_ICON_BY_SUBTYPE[`${category}:${subtype}`]) {
    return DEFAULT_ICON_BY_SUBTYPE[`${category}:${subtype}`]
  }
  return DEFAULT_ICON[category] || 'coin'
}

export function IconGlyph({ name, category, subtype, className }) {
  const key = name && ICON_DEFS[name] ? name : defaultIconFor(category, subtype)
  const Render = ICON_DEFS[key]
  return <span className={className}><Render /></span>
}
