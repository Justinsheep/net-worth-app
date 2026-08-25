import { useState, useRef } from 'react'

const REVEAL = 104 // 露出的動作按鈕總寬度
const THRESHOLD = 36 // 拖超過這個距離才算「要展開」

export default function SwipeRow({ rowKey, openKey, onOpenChange, actions, onTap, frontClassName, children }) {
  const isOpen = openKey === rowKey
  const [dragX, setDragX] = useState(null) // null＝沒在拖，交給 isOpen 決定位置
  const startXRef = useRef(null)
  const movedRef = useRef(false)

  function onPointerDown(e) {
    startXRef.current = e.clientX
    movedRef.current = false
    setDragX(isOpen ? REVEAL : 0)
  }
  function onPointerMove(e) {
    if (startXRef.current == null) return
    const delta = e.clientX - startXRef.current
    if (Math.abs(delta) > 6) movedRef.current = true
    const base = isOpen ? REVEAL : 0
    setDragX(Math.max(0, Math.min(REVEAL, base + delta)))
  }
  function endDrag() {
    if (startXRef.current == null) return
    if (!movedRef.current) {
      // 純點擊（沒有拖動）
      if (isOpen || openKey != null) onOpenChange(null) // 本來就開著、或別列開著：先收起來就好
      else onTap?.()
    } else {
      onOpenChange((dragX ?? 0) > THRESHOLD ? rowKey : null)
    }
    setDragX(null)
    startXRef.current = null
  }

  const x = dragX != null ? dragX : (isOpen ? REVEAL : 0)

  return (
    <div className="swipe-row">
      <div className="swipe-actions">
        {actions.map((a, i) => (
          <button
            key={i}
            className={'swipe-action-btn' + (a.danger ? ' danger' : '')}
            onClick={() => { onOpenChange(null); a.onClick() }}
            aria-label={a.label}
            title={a.label}
          >
            {a.icon}
          </button>
        ))}
      </div>
      <div
        className={'swipe-front' + (frontClassName ? ' ' + frontClassName : '')}
        style={{ transform: `translateX(${x}px)`, transition: dragX != null ? 'none' : 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {children}
      </div>
    </div>
  )
}
