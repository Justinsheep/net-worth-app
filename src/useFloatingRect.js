import { useState, useEffect, useCallback } from 'react'

// 回傳 [rect, measure]。rect 是輸入框相對「整個畫面」的位置，給 createPortal 出去的
// 下拉選單用 position:fixed 定位，這樣才不會被彈窗自己的捲動框裁切看不到。
export function useFloatingRect(open, anchorRef) {
  const [rect, setRect] = useState(null)

  const measure = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [anchorRef])

  useEffect(() => {
    if (!open) { setRect(null); return }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true) // capture:true 才抓得到彈窗內部的捲動
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  return rect
}
