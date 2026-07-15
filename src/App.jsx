import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { store } from './store'
import { summarize, summarizePnl, fmtTwd, fmtPct } from './calc'
import { loadPrices } from './prices'
import AllocationChart from './components/AllocationChart'
import TrendChart from './components/TrendChart'
import HoldingForm from './components/HoldingForm'
import HoldingsTable from './components/HoldingsTable'

const REFRESH_MS = 60_000 // 每 60 秒自動更新一次報價

export default function App() {
  const holdings = useLiveQuery(() => db.holdings.orderBy('updatedAt').reverse().toArray(), [], [])
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), [], [])
  const [trendMetric, setTrendMetric] = useState('net')
  const [fx, setFx] = useState(32)
  const [fxAuto, setFxAuto] = useState(true)
  const [prices, setPrices] = useState({})
  const [priceMeta, setPriceMeta] = useState({ updatedAt: null, stockUpdatedAt: null, errors: [] })
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  // 讀取上次存的匯率與自動/手動設定
  useEffect(() => {
    store.getSetting('usdTwd', 32).then(setFx)
    store.getSetting('fxAuto', true).then(setFxAuto)
  }, [])

  // 依「有哪些代號」決定何時重抓（新增/刪除持倉會觸發）
  const symbolsKey = useMemo(
    () => holdings.map((h) => h.category + ':' + (h.symbol || '')).join(','),
    [holdings]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await loadPrices(holdings)
      setPrices(r.prices)
      setPriceMeta({ updatedAt: new Date().toISOString(), stockUpdatedAt: r.stockUpdatedAt, errors: r.errors })
      if (fxAuto && r.fxUsdTwd) {
        setFx(r.fxUsdTwd)
        store.setSetting('usdTwd', r.fxUsdTwd)
      }
    } finally {
      setLoading(false)
    }
  }, [holdings, fxAuto])

  // 掛載、代號改變、切換自動匯率時抓一次；並每 60 秒自動更新
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, fxAuto])

  function changeFx(v) {
    setFx(v)
    store.setSetting('usdTwd', Number(v) || 0)
  }
  function toggleFxAuto() {
    const next = !fxAuto
    setFxAuto(next)
    store.setSetting('fxAuto', next)
  }

  const { totalAsset, totalDebt, netWorth, byCat } = summarize(holdings, fx, prices)
  const pnl = summarizePnl(holdings, fx, prices)

  // 每天記錄一次資產快照（同一天以最新值覆蓋），累積成走勢
  useEffect(() => {
    if (loading || !holdings.length) return
    const date = new Date().toISOString().slice(0, 10)
    store.putSnapshot({ id: date, date, netWorthTwd: netWorth, totalAssetTwd: totalAsset, totalDebtTwd: totalDebt })
  }, [netWorth, totalAsset, totalDebt, loading, holdings.length])

  function openAdd() { setEditing(null); setFormOpen(true) }
  function openEdit(h) { setEditing(h); setFormOpen(true) }
  async function save(rec) {
    if (editing) await store.updateHolding(editing.id, rec)
    else await store.addHolding(rec)
    setFormOpen(false); setEditing(null)
  }
  async function remove(h) {
    if (confirm(`刪除「${h.name}」？`)) await store.deleteHolding(h.id)
  }

  async function exportData() {
    const data = await store.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `總資產備份_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  function importData(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result)
        if (confirm('匯入會覆蓋目前所有資料，確定？')) await store.importAll(data)
      } catch { alert('檔案格式不正確') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const updatedTime = priceMeta.updatedAt
    ? new Date(priceMeta.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          <h1>我的總資產</h1>
        </div>
        <div className="top-actions">
          <div className="fx">
            <span>USD/TWD</span>
            <input
              type="number"
              inputMode="decimal"
              value={Number(fx).toFixed ? Number(fx).toFixed(2) : fx}
              disabled={fxAuto}
              onChange={(e) => changeFx(e.target.value)}
            />
            <button className={'fx-toggle' + (fxAuto ? ' on' : '')} onClick={toggleFxAuto}>
              {fxAuto ? '自動' : '手動'}
            </button>
          </div>
          <button className="btn primary" onClick={openAdd}>＋ 新增</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-label">淨資產</div>
        <div className={'hero-value' + (netWorth < 0 ? ' neg' : '')}>{fmtTwd(netWorth)}</div>
        <div className="hero-rule" />
        <div className="hero-stats">
          <div className="stat">
            <span className="stat-label">總資產</span>
            <span className="stat-value pos">{fmtTwd(totalAsset)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">總負債</span>
            <span className="stat-value neg">{fmtTwd(totalDebt)}</span>
          </div>
          {pnl.hasAny && (
            <div className="stat" title="只計已填成本的部位">
              <span className="stat-label">未實現損益</span>
              <span className={'stat-value ' + (pnl.pnlTwd >= 0 ? 'pos' : 'neg')}>
                {fmtTwd(pnl.pnlTwd)} <small className="stat-pct">{fmtPct(pnl.roi)}</small>
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="pricebar">
        <span className={'pricebar-status' + (loading ? ' loading' : '')}>
          <span className="live-dot" />
          報價更新於 {updatedTime}
        </span>
        <span className="pricebar-note">加密貨幣・匯率 即時　|　台股・美股 來自 prices.json</span>
        <button className="ghost-mini" onClick={refresh} disabled={loading}>
          {loading ? '更新中…' : '↻ 重新整理'}
        </button>
      </div>
      {priceMeta.errors.length > 0 && (
        <div className="pricebar-errors">{priceMeta.errors.join('　·　')}</div>
      )}

      <section className="panel trend">
        <div className="trend-head">
          <h3 className="panel-title">資產走勢</h3>
          <div className="seg">
            <button className={trendMetric === 'net' ? 'on' : ''} onClick={() => setTrendMetric('net')}>淨資產</button>
            <button className={trendMetric === 'asset' ? 'on' : ''} onClick={() => setTrendMetric('asset')}>總資產</button>
          </div>
        </div>
        <TrendChart snapshots={snapshots} metric={trendMetric} />
      </section>

      <div className="grid">
        <section className="panel">
          <h3 className="panel-title">資產配置</h3>
          <AllocationChart byCat={byCat} />
        </section>

        <section className="panel">
          <h3 className="panel-title">持倉明細</h3>
          {holdings.length === 0 ? (
            <div className="empty">
              還沒有任何資料。<br />按右上角「＋ 新增」加入你的第一筆持倉或負債。
            </div>
          ) : (
            <HoldingsTable holdings={holdings} fx={fx} prices={prices} onEdit={openEdit} onDelete={remove} />
          )}
        </section>
      </div>

      <footer className="footer">
        <button className="link-btn" onClick={exportData}>匯出備份</button>
        <label className="link-btn">
          匯入備份
          <input type="file" accept="application/json" onChange={importData} hidden />
        </label>
        <span className="footer-note">資料只存在這台裝置的瀏覽器裡（IndexedDB）。</span>
      </footer>

      {formOpen && (
        <HoldingForm editing={editing} onSave={save} onClose={() => { setFormOpen(false); setEditing(null) }} />
      )}
    </div>
  )
}
