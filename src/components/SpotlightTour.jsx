import { useState, useEffect, useLayoutEffect, useRef } from 'react'

const STEPS = [
  { tab: 'overview', selector: '[data-tour="hero"]', title: '這裡看淨資產', desc: '總覽頁一打開就看到淨資產、資產配置，重點一眼掌握。' },
  { tab: 'overview', selector: '[data-tour="fab"]', title: '新增資產', desc: '股票、加密貨幣、現金、銀行、負債，都從這顆「＋」開始新增。' },
  { tab: 'holdings', selector: '[data-tour="holdings-panel"]', title: '細項管理', desc: '每個分類可以收合，點進去看交易明細，還能直接加碼或編輯。' },
  { tab: 'trend', selector: '[data-tour="trend-panel"]', title: '資產走勢', desc: '每天自動記一筆，慢慢就能看到資產怎麼成長。' },
  { tab: 'settings', selector: '[data-tour="simple-toggle"]', title: '簡易版與同步', desc: '只想單純記帳可以切成簡易版；登入 Google 還能跨裝置同步。' },
]

const PAD = 8 // 光圈比目標元素多留的邊距

export default function SpotlightTour({ activeTab, onNavigate, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const step = STEPS[stepIdx]

  // 切換步驟時，先切到該步驟需要的分頁
  useEffect(() => {
    if (step.tab && step.tab !== activeTab) onNavigate(step.tab)
  }, [stepIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  // 分頁對了之後，量測目標元素位置（給一點時間讓分頁切換動畫/DOM 更新）
  useLayoutEffect(() => {
    if (step.tab && step.tab !== activeTab) return
    setRect(null)
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

  // 視窗大小改變/捲動時重新量測
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

  const last = stepIdx === STEPS.length - 1
  const vw = typeof window !== 'undefined' ? window.innerWidth : 400
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  const hole = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null

  // 提示框位置：優先放在光圈下方，空間不夠就放上方；水平置中並夾在螢幕範圍內
  let tipTop = vh / 2 - 60
  let tipLeft = vw / 2
  let placement = 'center'
  if (hole) {
    const spaceBelow = vh - (hole.top + hole.height)
    if (spaceBelow > 170) { tipTop = hole.top + hole.height + 16; placement = 'below' }
    else if (hole.top > 170) { tipTop = hole.top - 16; placement = 'above' }
    else { tipTop = vh / 2 - 60; placement = 'center' }
    tipLeft = Math.min(Math.max(hole.left + hole.width / 2, 160), vw - 160)
  }

  return (
    <div className="tour-root">
      {hole ? (
        <>
          <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(hole.top, 0) }} />
          <div className="tour-mask" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-mask" style={{ top: hole.top, left: 0, width: Math.max(hole.left, 0), height: hole.height }} />
          <div className="tour-mask" style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }} />
          <div className="tour-ring" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
          <div className="tour-block" style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }} />
        </>
      ) : (
        <div className="tour-mask" style={{ inset: 0 }} />
      )}

      <button className="tour-skip" onClick={onFinish}>略過</button>

      <div
        className={'tour-tip tour-tip-' + placement}
        style={placement === 'center'
          ? { top: tipTop, left: '50%', transform: 'translateX(-50%)' }
          : { top: tipTop, left: tipLeft, transform: `translate(-50%, ${placement === 'above' ? '-100%' : '0'})` }}
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
