import { useState, useEffect, useLayoutEffect, useRef } from 'react'

const STEPS = [
  { tab: 'overview', selector: '[data-tour="hero"]', title: '這裡看淨資產', desc: '總覽頁一打開就看到淨資產、資產配置，重點一眼掌握。' },
  { tab: 'overview', selector: '[data-tour="fab"]', title: '新增資產', desc: '股票、加密貨幣、現金、銀行、負債，都從這顆「＋」開始新增。', round: true },
  { tab: 'holdings', selector: '[data-tour="holdings-panel"]', title: '細項管理', desc: '每個分類可以收合，點進去看交易明細，還能直接加碼或編輯。' },
  { tab: 'trend', selector: '[data-tour="trend-panel"]', title: '資產走勢', desc: '每天自動記一筆，慢慢就能看到資產怎麼成長。' },
  { tab: 'settings', selector: '[data-tour="simple-toggle"]', title: '簡易版與同步', desc: '只想單純記帳可以切成簡易版；登入 Google 還能跨裝置同步。' },
]

const PAD = 8    // 光圈比目標元素多留的邊距
const MARGIN = 12 // 提示框跟螢幕邊緣至少留的距離
const GAP = 14    // 提示框跟光圈之間的間距

export default function SpotlightTour({ activeTab, onNavigate, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const [tipPos, setTipPos] = useState(null) // 量完提示框自己的尺寸後才算出最終位置，避免跑出螢幕
  const tipRef = useRef(null)
  const step = STEPS[stepIdx]

  // 切換步驟時，先切到該步驟需要的分頁
  useEffect(() => {
    if (step.tab && step.tab !== activeTab) onNavigate(step.tab)
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // 分頁對了之後，量測目標元素位置（給一點時間讓分頁切換動畫/DOM 更新）
  useLayoutEffect(() => {
    if (step.tab && step.tab !== activeTab) return
    setRect(null)
    setTipPos(null)
    let cancelled = false
    const measure = () => {
      const el = document.querySelector(step.selector)
      if (!el) { if (!cancelled) setRect(null); return }
      el.scrollIntoView({ block: 'center', behavior: 'instant' })
      const r = el.getBoundingClientRect()
      if (!cancelled) setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    const t = setTimeout(measure, 90)
    return () => { cancelled = true; clearTimeout(t) }
  }, [stepIdx, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // 視窗大小改變/捲動時重新量測目標
  useEffect(() => {
    const onResize = () => {
      const el = document.querySelector(step.selector)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true) }
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const hole = rect
    ? {
        top: rect.top - (step.round ? 3 : PAD),
        left: rect.left - (step.round ? 3 : PAD),
        width: rect.width + (step.round ? 6 : PAD * 2),
        height: rect.height + (step.round ? 6 : PAD * 2),
        round: !!step.round,
      }
    : null

  // 提示框先「隱形」渲染一次量出自己的實際寬高，量完才夾在螢幕範圍內定位——
  // 這樣不管內容多長、螢幕多小都不會跑出畫面外，不用用猜的數字。
  useLayoutEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const el = tipRef.current
    if (!el) return
    const tw = el.offsetWidth
    const th = el.offsetHeight

    let left, top
    if (hole) {
      left = hole.left + hole.width / 2 - tw / 2
      const spaceBelow = vh - (hole.top + hole.height)
      const spaceAbove = hole.top
      if (spaceBelow >= th + GAP + MARGIN) top = hole.top + hole.height + GAP
      else if (spaceAbove >= th + GAP + MARGIN) top = hole.top - GAP - th
      else top = vh / 2 - th / 2 // 上下都不夠，退回置中疊在光圈附近
    } else {
      left = vw / 2 - tw / 2
      top = vh / 2 - th / 2
    }
    left = Math.min(Math.max(left, MARGIN), vw - tw - MARGIN)
    top = Math.min(Math.max(top, MARGIN), vh - th - MARGIN)
    setTipPos({ left, top })
  }, [hole?.top, hole?.left, hole?.width, hole?.height, stepIdx])

  const last = stepIdx === STEPS.length - 1

  return (
    <div className="tour-root">
      {hole ? (
        <>
          <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(hole.top, 0) }} />
          <div className="tour-mask" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-mask" style={{ top: hole.top, left: 0, width: Math.max(hole.left, 0), height: hole.height }} />
          <div className="tour-mask" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div className="tour-ring" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, borderRadius: hole.round ? '50%' : undefined }} />
          <div className="tour-block" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
        </>
      ) : (
        <div className="tour-mask" style={{ inset: 0 }} />
      )}

      <button className="tour-skip" onClick={onFinish}>略過</button>

      <div
        ref={tipRef}
        className="tour-tip"
        style={{
          top: tipPos ? tipPos.top : -9999,
          left: tipPos ? tipPos.left : -9999,
          visibility: tipPos ? 'visible' : 'hidden',
        }}
      >
        <div className="tour-step-count">{stepIdx + 1} / {STEPS.length}</div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-desc">{step.desc}</p>
        <div className="tour-actions">
          {stepIdx > 0 && <button className="btn ghost sm" onClick={() => setStepIdx(stepIdx - 1)}>上一步</button>}
          <button className="btn primary sm tour-next" onClick={() => (last ? onFinish() : setStepIdx(stepIdx + 1))}>
            {last ? '完成' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}
