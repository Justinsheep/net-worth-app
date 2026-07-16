import { useState, useEffect, useRef } from 'react'
import { loadSymbols, searchSymbols } from '../symbols'
import { isEtfCode } from '../calc'

// 哪些分類有搜尋清單
const LIST_KEY = { tw_stock: 'tw_stock', crypto: 'crypto' }

export default function SymbolSearch({ category, subtype, value, onPick, placeholder }) {
  const listKey = LIST_KEY[category]
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState([])
  const boxRef = useRef(null)

  useEffect(() => {
    if (listKey) loadSymbols().then(setData)
  }, [listKey])

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // 台股依子分類（個股/ETF）篩選；其他分類不篩選
  function applySubtypeFilter(list) {
    if (category !== 'tw_stock' || !subtype) return list
    return list.filter((it) => (subtype === 'etf' ? isEtfCode(it.code) : !isEtfCode(it.code)))
  }

  function onType(v) {
    onPick(v, null) // 只更新代號，不動名稱
    if (data && listKey) {
      const m = searchSymbols(applySubtypeFilter(data[listKey] || []), v)
      setMatches(m)
      setOpen(m.length > 0)
    }
  }

  function choose(it) {
    onPick(it.code, it.name) // 帶入代號 + 名稱
    setOpen(false)
  }

  return (
    <div className="symsearch" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => setOpen(matches.length > 0)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="symsearch-list">
          {matches.map((it) => (
            <li key={it.code} onMouseDown={() => choose(it)}>
              <span className="sym-code">{it.code}</span>
              <span className="sym-name">{it.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
