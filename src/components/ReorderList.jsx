import { useEffect, useRef, useState } from 'react'

const LONG_PRESS_MS = 400
const MOVE_CANCEL_PX = 8
const SHIFT_TRANSITION = 'transform 0.15s ease'

// 長按拖曳排序：包住一串列項，長按其中一項超過 LONG_PRESS_MS 且沒有明顯移動，
// 就進入拖曳模式，之後跟著手指/滑鼠垂直移動——拖過去的其他列會即時讓出空間
// （往反方向讓開一個身位），不是放開才整批跳位置。放開時把新順序丟給 onReorder。
// 用 window 層級、capture 階段監聽 pointermove/up，這樣長按觸發後可以直接
// 吃掉事件、不讓它繼續傳到裡面的 SwipeRow（否則會被誤認成一次滑動或點擊）。
export default function ReorderList({ order, renderItem, onReorder, className }) {
  const [dragKey, setDragKey] = useState(null)
  const [dragY, setDragY] = useState(0)
  const [hoverIndex, setHoverIndex] = useState(null)
  // onMove/onUp 是 pointerdown 當下就註冊給 window 的舊 closure，讀 React state
  // 會拿到當時的舊值；這幾個用 ref 才能在 onUp/onMove 裡面拿到最新的值
  const dragYRef = useRef(0)
  const hoverIndexRef = useRef(null)
  const fromIndexRef = useRef(null)
  const rowRefs = useRef(new Map())
  const rectsRef = useRef([])
  const startRef = useRef({ y: 0, key: null })
  const timerRef = useRef(null)
  const draggingRef = useRef(false)
  const orderRef = useRef(order)
  orderRef.current = order

  function cleanupWindowListeners() {
    window.removeEventListener('pointermove', onMove, true)
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
  }

  function nearestIndex(centerY) {
    const rects = rectsRef.current
    for (let i = 0; i < rects.length; i++) {
      if (centerY < rects[i].center) return i
    }
    return rects.length - 1
  }

  function onMove(e) {
    if (draggingRef.current) {
      e.preventDefault()
      e.stopPropagation()
      dragYRef.current = e.clientY - startRef.current.y
      setDragY(dragYRef.current)
      const origin = rectsRef.current[fromIndexRef.current]
      const finalCenter = (origin?.top ?? 0) + (origin?.height ?? 0) / 2 + dragYRef.current
      const idx = nearestIndex(finalCenter)
      if (idx !== hoverIndexRef.current) {
        hoverIndexRef.current = idx
        setHoverIndex(idx)
      }
      return
    }
    if (Math.abs(e.clientY - startRef.current.y) > MOVE_CANCEL_PX) {
      clearTimeout(timerRef.current)
      cleanupWindowListeners()
    }
  }

  function onUp(e) {
    if (draggingRef.current) {
      e.preventDefault()
      e.stopPropagation()
      const fromKey = startRef.current.key
      const toIndex = hoverIndexRef.current != null ? hoverIndexRef.current : fromIndexRef.current
      draggingRef.current = false
      setDragKey(null)
      setDragY(0)
      setHoverIndex(null)
      dragYRef.current = 0
      hoverIndexRef.current = null
      fromIndexRef.current = null
      cleanupWindowListeners()
      const cur = [...orderRef.current]
      const fromIndex = cur.indexOf(fromKey) // 用當下的 order 重新找，避免跟拖曳開始時的舊索引對不起來
      if (fromIndex !== -1 && toIndex != null && fromIndex !== toIndex) {
        cur.splice(fromIndex, 1)
        cur.splice(toIndex, 0, fromKey)
        onReorder(cur)
      }
      return
    }
    clearTimeout(timerRef.current)
    cleanupWindowListeners()
  }

  function handlePointerDown(key, e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startRef.current = { y: e.clientY, key }
    draggingRef.current = false
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    timerRef.current = setTimeout(() => {
      const rects = orderRef.current.map((k) => {
        const el = rowRefs.current.get(k)
        const r = el.getBoundingClientRect()
        return { key: k, top: r.top, height: r.height, center: r.top + r.height / 2 }
      })
      rectsRef.current = rects
      const idx = rects.findIndex((r) => r.key === key)
      fromIndexRef.current = idx
      hoverIndexRef.current = idx
      draggingRef.current = true
      setDragKey(key)
      dragYRef.current = 0
      setDragY(0)
      setHoverIndex(idx)
      if (navigator.vibrate) navigator.vibrate(12)
    }, LONG_PRESS_MS)
  }

  useEffect(() => () => { clearTimeout(timerRef.current); cleanupWindowListeners() }, [])

  const fromIndex = dragKey != null ? fromIndexRef.current : null
  const draggedHeight = fromIndex != null ? (rectsRef.current[fromIndex]?.height ?? 0) : 0

  return (
    <div className={className}>
      {order.map((key, i) => {
        const isDragged = dragKey === key
        let shiftY = 0
        // 拖曳中的那一列跳過的其他列，往反方向讓開一個身位（跟拖曳項目一樣高），
        // 造出「其他列先被擠開」的感覺，而不是放開才整批跳位置
        if (!isDragged && fromIndex != null && hoverIndex != null) {
          if (fromIndex < hoverIndex && i > fromIndex && i <= hoverIndex) shiftY = -draggedHeight
          else if (fromIndex > hoverIndex && i >= hoverIndex && i < fromIndex) shiftY = draggedHeight
        }
        return (
          <div
            key={key}
            ref={(el) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key) }}
            className={'reorder-row' + (isDragged ? ' dragging' : '')}
            style={
              isDragged
                ? { transform: `translateY(${dragY}px)`, transition: 'none' }
                : { transform: `translateY(${shiftY}px)`, transition: SHIFT_TRANSITION }
            }
            onPointerDown={(e) => handlePointerDown(key, e)}
          >
            {renderItem(key)}
          </div>
        )
      })}
    </div>
  )
}
