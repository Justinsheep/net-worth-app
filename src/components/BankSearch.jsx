import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { TW_BANKS } from '../banks'
import { useFloatingRect } from '../useFloatingRect'

export default function BankSearch({ value, onChange, onSelect, placeholder, autoFocus }) {
  const [open, setOpen] = useState(false)
  const [matches, setMatches] = useState(TW_BANKS)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const rect = useFloatingRect(open, inputRef)

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && !e.target.closest('.symsearch-list-portal')) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function onType(v) {
    onChange(v)
    const q = v.trim()
    if (!q) { setOpen(false); return }
    setMatches(TW_BANKS.filter((b) => b.includes(q)))
    setOpen(true)
  }

  function choose(name) {
    onChange(name)
    onSelect?.(name)
    setOpen(false)
  }

  return (
    <div className="symsearch" ref={boxRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onType(e.target.value)}
        onFocus={() => { const q = value.trim(); if (q) { setMatches(TW_BANKS.filter((b) => b.includes(q))); setOpen(true) } }}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {open && matches.length > 0 && rect && createPortal(
        <ul
          className="symsearch-list symsearch-list-portal"
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
        >
          {matches.map((name) => (
            <li key={name} onMouseDown={() => choose(name)}>
              <span className="sym-name">{name}</span>
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  )
}
