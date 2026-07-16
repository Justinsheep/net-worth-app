import { useState, useEffect, useRef } from 'react'
import { TW_BANKS } from '../banks'

export default function BankSearch({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState(TW_BANKS)
  const boxRef = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function onType(v) {
    onChange(v)
    const q = v.trim()
    setMatches(q ? TW_BANKS.filter((b) => b.includes(q)) : TW_BANKS)
    setOpen(true)
  }

  function choose(name) {
    onChange(name)
    setOpen(false)
  }

  return (
    <div className="symsearch" ref={boxRef}>
      <input
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { setMatches(value.trim() ? TW_BANKS.filter((b) => b.includes(value.trim())) : TW_BANKS); setOpen(true) }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul className="symsearch-list">
          {matches.map((name) => (
            <li key={name} onMouseDown={() => choose(name)}>
              <span className="sym-name">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
