import { useState } from 'react'
import { fmtTwd, fmtNum } from '../calc'

const pct = (x, d = 1) => (x == null ? '—' : (x * 100).toFixed(d) + '%')
const trancheText = (idx) => idx.map((i) => i + 1).join('、')

// 總覽頁的「今日 00631L 建議」卡片：一眼看出今天新資金該進現金池還是買正二，
// 以及有沒有加碼（下跌）或賣出（占比過高）的指示。
export default function PlanCard({ result, poolName, onMarkUsed, onTradeDeploy, onTradeSell }) {
  // 收合狀態記在這台裝置（localStorage），下次打開維持上次的樣子
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('planCardOpen') !== '0' } catch { return true }
  })
  function toggle() {
    const next = !open
    setOpen(next)
    try { localStorage.setItem('planCardOpen', next ? '1' : '0') } catch { /* 無痕模式等情況存不了就算了 */ }
  }
  if (!result) return null
  if (!result.ready) {
    return (
      <section className="panel plan-card">
        <h3 className="panel-title">00631L 今日建議</h3>
        <p className="plan-note">{result.reason}</p>
      </section>
    )
  }

  const r = result
  const deploy = r.actions.find((a) => a.type === 'deploy')
  const sell = r.actions.find((a) => a.type === 'sell')
  const m = r.monthly
  const moneyTitle =
    m.mode === 'stock' ? '全買正二' : m.mode === 'pool' ? '全進現金池（暫停買正二）' : `${m.stockPct}% 買正二・${m.poolPct}% 進現金池`

  return (
    <section className="panel plan-card" data-tour="plan-card">
      <button type="button" className="plan-head plan-toggle" onClick={toggle} aria-expanded={open}>
        <span className="plan-toggle-title">
          <span className={'chev' + (open ? ' open' : '')} aria-hidden="true">›</span>
          <h3 className="panel-title">00631L 今日建議</h3>
        </span>
        <span className="plan-ratio" title={`正二 ${fmtTwd(r.stockValue)}　現金池 ${fmtTwd(r.poolValue)}`}>
          占比 {pct(r.ratio)}
        </span>
      </button>

      {!open && (
        <div className="plan-summary">
          {sell && <div className="plan-summary-alert sell">賣出正二約 {fmtTwd(sell.amount)}</div>}
          {deploy && <div className="plan-summary-alert deploy">動用第 {trancheText(deploy.indexes)} 倉加碼 {fmtTwd(deploy.amount)}</div>}
          <div>新資金 → <b className={'plan-money-value ' + m.mode}>{moneyTitle}</b></div>
        </div>
      )}

      {open && (
        <>

      {sell && (
        <div className="plan-alert sell">
          <div className="plan-alert-title">賣出正二</div>
          <div className="plan-alert-body">
            占比 {pct(r.ratio)} 超過 {r.plan.params.sellAbovePct}%，建議賣出約 <b>{fmtTwd(sell.amount)}</b>（約 {fmtNum(Math.round(sell.shares))} 股），
            賣到占比 {sell.toPct}%，所得放回現金池。
          </div>
          <div className="plan-actions">
            <button className="btn primary sm" onClick={() => onTradeSell(sell)}>記一筆賣出</button>
          </div>
        </div>
      )}

      {deploy && (
        <div className="plan-alert deploy">
          <div className="plan-alert-title">動用第 {trancheText(deploy.indexes)} 倉加碼</div>
          <div className="plan-alert-body">
            跌破高點 {deploy.levels.map((l) => `−${l}%`).join('、')}，從現金池{poolName ? `「${poolName}」` : ''}拿 <b>{fmtTwd(deploy.amount)}</b> 買 00631L。
            {deploy.poolEmpty && <span className="plan-warn">（現金池目前沒有餘額）</span>}
          </div>
          <div className="plan-actions">
            <button className="btn primary sm" onClick={() => onTradeDeploy(deploy)}>記一筆買入</button>
            <button className="btn ghost sm" onClick={() => onMarkUsed(deploy.indexes, deploy.amount)}>我已執行</button>
          </div>
        </div>
      )}

      <div className="plan-money">
        <div className="plan-money-label">今日新資金去向</div>
        <div className={'plan-money-value ' + m.mode}>{moneyTitle}</div>
        {m.stockAmount != null && (
          <div className="plan-money-amt">
            {m.stockAmount > 0 && <span>買正二 {fmtTwd(m.stockAmount)}</span>}
            {m.poolAmount > 0 && <span>進現金池 {fmtTwd(m.poolAmount)}</span>}
          </div>
        )}
        <div className="plan-note">{m.reason}</div>
        {m.mode === 'pool' && m.needAmount > 0 && (
          <div className="plan-note">再放 {fmtTwd(m.needAmount)} 進現金池，占比會回到約 {r.plan.params.targetPct}%</div>
        )}
        {m.mode === 'stock' && m.needAmount > 0 && (
          <div className="plan-note">再買約 {fmtTwd(m.needAmount)} 的正二，占比會回到約 {r.plan.params.targetPct}%</div>
        )}
      </div>

      <div className="plan-stats">
        <div>
          <span className="plan-stat-label">歷史高點{r.manualAth ? '（手動）' : ''}</span>
          <span className="plan-stat-value">{fmtNum(r.ath)}</span>
          <span className="plan-stat-sub">{r.athDate}</span>
        </div>
        <div>
          <span className="plan-stat-label">現價</span>
          <span className="plan-stat-value">{fmtNum(r.price)}</span>
        </div>
        <div>
          <span className="plan-stat-label">距高點</span>
          <span className="plan-stat-value neg-if">{r.drawdown > 0 ? '−' + pct(r.drawdown) : '0%'}</span>
          {r.maxDrawdown - r.drawdown > 0.005 && <span className="plan-stat-sub">最深 −{pct(r.maxDrawdown)}</span>}
        </div>
      </div>

      <div className="plan-pills">
        {r.tranches.map((t) => (
          <span key={t.index} className={'plan-pill ' + t.status} title={`第 ${t.index + 1} 倉：跌到 ${fmtNum(t.triggerPrice)}（−${t.level}%）`}>
            {t.status === 'used' ? '✓ ' : ''}第{t.index + 1}倉 −{t.level}%
          </span>
        ))}
      </div>
      <div className="plan-note">
        {r.nextTrigger
          ? `下一倉：第 ${r.nextTrigger.index + 1} 倉，收盤跌到 ${fmtNum(r.nextTrigger.triggerPrice)}（−${r.nextTrigger.level}%）觸發`
          : deploy ? '' : '這一輪的倉都已動用或觸發，等創新高開始新一輪'}
      </div>
        </>
      )}
    </section>
  )
}
