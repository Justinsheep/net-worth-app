import { useState, useEffect } from 'react'
import { fmtNum } from '../calc'
import { newPlan, normalizePlan, toggleUsed, DEFAULT_PARAMS } from '../plan'

const today = () => new Date().toISOString().slice(0, 10)
const accountLabel = (h) => `${h.bankName ? h.bankName + '　' : ''}${h.name}（${fmtNum(h.quantity)} ${h.currency}）`

// 設定頁的「投資規則」區塊：啟用、綁定現金池帳戶、每月新增資金、倉位狀態、進階參數。
// 開關／帳戶／倉位狀態改了就直接存；數字參數要按「儲存參數」。
export default function PlanSettings({ plan: planIn, accounts, hist, result, onSave }) {
  const plan = planIn ? normalizePlan(planIn) : newPlan()
  const p = plan.params
  const [monthly, setMonthly] = useState(String(p.monthly || ''))
  const [manualAth, setManualAth] = useState(plan.manualAth ? String(plan.manualAth) : '')
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { setMonthly(String(plan.params.monthly || '')) }, [plan.params.monthly])
  useEffect(() => { setManualAth(plan.manualAth ? String(plan.manualAth) : '') }, [plan.manualAth])

  const save = (patch) => onSave(normalizePlan({ ...plan, ...patch }))
  const saveParams = (patch) => save({ params: { ...p, ...patch } })

  function saveMonthly() {
    const n = Number(monthly)
    if (monthly !== '' && !(n >= 0)) return
    saveParams({ monthly: n || 0 })
  }
  function saveManualAth() {
    const n = Number(manualAth)
    save({ manualAth: n > 0 ? n : null })
  }

  const d = draft || {
    levels: p.levels.join(','), targetPct: p.targetPct, pauseAbovePct: p.pauseAbovePct,
    allStockBelowPct: p.allStockBelowPct, sellAbovePct: p.sellAbovePct, sellToPct: p.sellToPct,
  }
  function saveAdvanced() {
    const levels = String(d.levels).split(/[,，\s]+/).filter(Boolean).map(Number)
    const t = Number(d.targetPct), pa = Number(d.pauseAbovePct), lo = Number(d.allStockBelowPct)
    const sa = Number(d.sellAbovePct), st = Number(d.sellToPct)
    if (!levels.length || levels.length > 10 || levels.some((x) => !(x > 0 && x < 100)) || levels.some((x, i) => i && x <= levels[i - 1])) {
      return setError('下跌門檻請填由小到大的百分比，例如 10,20,30,40,50')
    }
    if (![t, pa, lo, sa, st].every((x) => x > 0 && x < 100) || !(lo < t && t < pa && pa < sa && t <= st && st < sa)) {
      return setError('占比請符合：全買正二線 < 預設占比 < 暫停線 < 賣出線，且「賣到」介於預設占比與賣出線之間')
    }
    setError('')
    const levelsChanged = levels.join() !== p.levels.join()
    save({
      params: { ...p, levels, targetPct: t, pauseAbovePct: pa, allStockBelowPct: lo, sellAbovePct: sa, sellToPct: st },
      ...(levelsChanged ? { used: levels.map(() => null), cycle: null } : {}),
    })
    setDraft(null)
  }
  function resetDefaults() {
    setDraft(null)
    setError('')
    save({ params: { ...DEFAULT_PARAMS, levels: [...DEFAULT_PARAMS.levels], monthly: p.monthly }, used: DEFAULT_PARAMS.levels.map(() => null), cycle: null })
  }

  const autoAth = hist?.ath ? `${fmtNum(hist.ath)}（${hist.athDate}）` : '尚未取得'
  const field = (k, v) => setDraft({ ...d, [k]: v })

  return (
    <section className="panel" data-tour="plan-settings">
      <h3 className="panel-title">投資規則：正二 00631L</h3>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">{plan.enabled ? '已啟用' : '未啟用'}</div>
          <div className="settings-row-sub">依歷史高點下跌加碼、依占比分配每月新資金，每天在總覽頁告訴你今天怎麼做。</div>
        </div>
        <div className="seg">
          <button className={plan.enabled ? 'on' : ''} onClick={() => !plan.enabled && save({ enabled: true })}>開</button>
          <button className={!plan.enabled ? 'on' : ''} onClick={() => plan.enabled && save({ enabled: false })}>關</button>
        </div>
      </div>

      {plan.enabled && (
        <>
          <div className="plan-set-block">
            <label className="plan-set-label">現金池帳戶（那 30% 加碼資金放的地方）</label>
            <select className="plan-set-input" value={plan.poolId || ''} onChange={(e) => save({ poolId: e.target.value || null })}>
              <option value="">— 請選擇 —</option>
              {accounts.map((h) => <option key={h.id} value={h.id}>{accountLabel(h)}</option>)}
            </select>
            <div className="plan-set-hint">占比 = 你的 00631L 市值 ÷（00631L 市值 + 這個帳戶的餘額），自動計算。</div>
          </div>

          <div className="plan-set-block">
            <label className="plan-set-label">每月新增資金（元，選填）</label>
            <input
              className="plan-set-input" inputMode="decimal" value={monthly} placeholder="例如 30000"
              onChange={(e) => setMonthly(e.target.value)} onBlur={saveMonthly}
            />
            <div className="plan-set-hint">填了之後，建議卡片會直接算出「幾元買正二、幾元進現金池」。</div>
          </div>

          <div className="plan-set-block">
            <label className="plan-set-label">這一輪的加碼倉（點一下可手動切換「已動用／可用」）</label>
            <div className="plan-pills">
              {plan.used.map((u, i) => (
                <button
                  key={i} type="button" className={'plan-pill btn-like ' + (u ? 'used' : 'waiting')}
                  onClick={() => save(toggleUsed(plan, i, today()))}
                  title={u ? `已動用：${u.date}${u.amount ? '，約 ' + fmtNum(u.amount) : ''}` : '可用'}
                >
                  {u ? '✓ ' : ''}第{i + 1}倉 −{p.levels[i]}%
                </button>
              ))}
            </div>
            <div className="plan-set-hint">
              動用過的倉會等 00631L 創新高、開始新一輪才重新開放。剛啟用時，依歷史早已跌破的倉會先標成已動用。
              {result?.ready && result.plan.cycle ? `　目前這一輪的高點：${fmtNum(result.plan.cycle.ath)}（${result.plan.cycle.athDate}）` : ''}
            </div>
          </div>

          <div className="plan-set-block">
            <label className="plan-set-label">歷史高點（收盤價）</label>
            <div className="plan-set-hint">自動：{autoAth}。抓不到或還原有誤時，可手動輸入覆蓋；留空就用自動值。</div>
            <input
              className="plan-set-input" inputMode="decimal" value={manualAth} placeholder="手動高點（留空＝自動）"
              onChange={(e) => setManualAth(e.target.value)} onBlur={saveManualAth}
            />
          </div>

          <details className="plan-adv">
            <summary>進階：門檻與占比參數</summary>
            <div className="plan-adv-grid">
              <label>下跌門檻 %<input className="plan-set-input" value={d.levels} onChange={(e) => field('levels', e.target.value)} /></label>
              <label>預設占比 %<input className="plan-set-input" value={d.targetPct} onChange={(e) => field('targetPct', e.target.value)} /></label>
              <label>暫停買正二（超過）%<input className="plan-set-input" value={d.pauseAbovePct} onChange={(e) => field('pauseAbovePct', e.target.value)} /></label>
              <label>全買正二（低於）%<input className="plan-set-input" value={d.allStockBelowPct} onChange={(e) => field('allStockBelowPct', e.target.value)} /></label>
              <label>賣出（超過）%<input className="plan-set-input" value={d.sellAbovePct} onChange={(e) => field('sellAbovePct', e.target.value)} /></label>
              <label>賣到占比 %<input className="plan-set-input" value={d.sellToPct} onChange={(e) => field('sellToPct', e.target.value)} /></label>
            </div>
            {error && <div className="plan-warn">{error}</div>}
            <div className="plan-actions">
              <button className="btn primary sm" onClick={saveAdvanced}>儲存參數</button>
              <button className="btn ghost sm" onClick={resetDefaults}>還原預設</button>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
