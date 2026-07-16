import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { store } from './store'
import { summarize, summarizePnl, fmtTwd, fmtPct } from './calc'
import { loadPrices } from './prices'
import { supabase, supabaseEnabled } from './supabase'
import { syncNow, wipeCloud, purgeHoldingsRemote } from './sync'
import AllocationChart from './components/AllocationChart'
import TrendChart from './components/TrendChart'
import HoldingForm from './components/HoldingForm'
import HoldingsTable from './components/HoldingsTable'
import ConfirmClearModal from './components/ConfirmClearModal'
import DeletedPanel from './components/DeletedPanel'

const REFRESH_MS = 60_000 // 每 60 秒自動更新一次報價

const TABS = [
  { key: 'overview', label: '總覽', icon: '◆' },
  { key: 'holdings', label: '細項', icon: '☰' },
  { key: 'trend', label: '走勢', icon: '⌁' },
  { key: 'settings', label: '設定', icon: '⚙' },
]

export default function App() {
  const holdings = useLiveQuery(
    () => db.holdings.orderBy('updatedAt').reverse().filter((h) => !h.deleted).toArray(),
    [], []
  )
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('date').toArray(), [], [])
  const deletedHoldings = useLiveQuery(
    () => db.holdings.orderBy('updatedAt').reverse().filter((h) => !!h.deleted).toArray(),
    [], []
  )
  const [tab, setTab] = useState('overview')
  const [trendMetric, setTrendMetric] = useState('net')
  const [session, setSession] = useState(null)
  const [fx, setFx] = useState(32)
  const [fxRates, setFxRates] = useState(null)
  const [fxAuto, setFxAuto] = useState(true)
  const [prices, setPrices] = useState({})
  const [priceMeta, setPriceMeta] = useState({ updatedAt: null, stockUpdatedAt: null, errors: [] })
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [template, setTemplate] = useState(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  // 讀取上次存的匯率與自動/手動設定
  useEffect(() => {
    store.getSetting('usdTwd', 32).then(setFx)
    store.getSetting('fxAuto', true).then(setFxAuto)
  }, [])

  // 新增/編輯面板開啟時鎖住背景捲動，避免面板位置隨頁面高度跑掉
  useEffect(() => {
    if (formOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [formOpen])

  // 登入狀態
  useEffect(() => {
    if (!supabaseEnabled) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // 登入後：立即同步、每 30 秒同步一次、切回分頁時同步
  useEffect(() => {
    if (!session) return
    const uid = session.user.id
    syncNow(uid)
    const t = setInterval(() => syncNow(uid), 30000)
    const onVis = () => { if (document.visibilityState === 'visible') syncNow(uid) }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [session])

  // 本機資料變動後 1.5 秒把變更推上雲端
  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => syncNow(session.user.id), 1500)
    return () => clearTimeout(t)
  }, [session, holdings, snapshots])

  function login() {
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } })
  }
  function logout() {
    supabase.auth.signOut()
  }

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
      if (r.fxRates) setFxRates(r.fxRates)
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

  const { totalAsset, totalDebt, netWorth, byCat } = summarize(holdings, fx, prices, fxRates)
  const pnl = summarizePnl(holdings, fx, prices)

  // 每天記錄一次資產快照（同一天以最新值覆蓋），累積成走勢
  useEffect(() => {
    if (loading || !holdings.length) return
    const date = new Date().toISOString().slice(0, 10)
    store.putSnapshot({ id: date, date, netWorthTwd: netWorth, totalAssetTwd: totalAsset, totalDebtTwd: totalDebt, updatedAt: Date.now() })
  }, [netWorth, totalAsset, totalDebt, loading, holdings.length])

  function openAdd() { setEditing(null); setTemplate(null); setFormOpen(true) }
  function openEdit(h) { setEditing(h); setTemplate(null); setFormOpen(true) }
  function openAddMore(h) {
    setEditing(null)
    setTemplate({
      category: h.category,
      subtype: h.subtype,
      name: h.name,
      symbol: h.symbol,
      bankName: h.bankName,
      currency: h.currency,
      icon: h.icon,
    })
    setFormOpen(true)
  }
  // 負債子分類/銀行分組的「加碼」：帶入分類與分組依據（子分類/銀行名），但不複製名稱
  // （因為同一子分類/同一家銀行底下的每一筆通常是不同的東西，例如兩台車的車貸）
  function openAddMoreBucket(category, extra) {
    setEditing(null)
    setTemplate({ category, ...extra })
    setFormOpen(true)
  }
  async function save(rec) {
    if (editing) await store.updateHolding(editing.id, rec)
    else await store.addHolding(rec)
    setFormOpen(false); setEditing(null)
  }
  async function remove(h) {
    if (confirm(`刪除「${h.name}」？（可以之後在設定的「已刪除」復原）`)) await store.deleteHolding(h.id)
  }
  async function removeMany(ids, label) {
    if (!ids.length) return
    if (confirm(`刪除「${label}」底下全部 ${ids.length} 筆？（可以之後在設定的「已刪除」復原）`)) {
      await store.deleteHoldings(ids)
    }
  }
  async function restoreHoldings(ids) {
    await store.restoreHoldings(ids)
  }
  async function purgeHoldings(ids) {
    await store.purgeHoldings(ids)
    if (session) await purgeHoldingsRemote(session.user.id, ids)
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

  function openClear() {
    setClearOpen(true)
  }
  async function confirmClear() {
    setClearing(true)
    try {
      await store.clearAll()
      if (session) await wipeCloud(session.user.id)
    } finally {
      setClearing(false)
      setClearOpen(false)
    }
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
      </header>

      <main className="tab-content">
        {tab === 'overview' && (
          <>
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
              <span className="pricebar-note">加密貨幣・匯率 即時　|　台股 來自每日收盤</span>
              <button className="ghost-mini" onClick={refresh} disabled={loading}>
                {loading ? '更新中…' : '↻ 重新整理'}
              </button>
            </div>
            {priceMeta.errors.length > 0 && (
              <div className="pricebar-errors">{priceMeta.errors.join('　·　')}</div>
            )}

            <section className="panel">
              <h3 className="panel-title">資產配置</h3>
              <AllocationChart byCat={byCat} />
            </section>
          </>
        )}

        {tab === 'holdings' && (
          <section className="panel">
            <h3 className="panel-title">持倉明細</h3>
            {holdings.length === 0 ? (
              <div className="empty">
                還沒有任何資料。<br />按右下角「＋」加入你的第一筆持倉或負債。
              </div>
            ) : (
              <HoldingsTable holdings={holdings} fx={fx} prices={prices} fxRates={fxRates} onEdit={openEdit} onDelete={remove} onDeleteMany={removeMany} onAddMore={openAddMore} onAddMoreBucket={openAddMoreBucket} />
            )}
          </section>
        )}

        {tab === 'trend' && (
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
        )}

        {tab === 'settings' && (
          <>
            {supabaseEnabled && (
              <section className="panel">
                <h3 className="panel-title">帳號與同步</h3>
                {session ? (
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">{session.user.email}</div>
                      <div className="settings-row-sub">已登入，資料自動跨裝置同步</div>
                    </div>
                    <button className="btn ghost" onClick={logout}>登出</button>
                  </div>
                ) : (
                  <div className="settings-row">
                    <div>
                      <div className="settings-row-title">目前只存這台裝置</div>
                      <div className="settings-row-sub">登入後可在手機、電腦間自動同步</div>
                    </div>
                    <button className="btn primary" onClick={login}>用 Google 登入</button>
                  </div>
                )}
              </section>
            )}

            <section className="panel">
              <h3 className="panel-title">匯率</h3>
              <div className="settings-row">
                <div>
                  <div className="settings-row-title">USD / TWD</div>
                  <div className="settings-row-sub">影響美股、加密貨幣換算成台幣的匯率</div>
                </div>
                <div className="fx">
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
              </div>
            </section>

            <section className="panel">
              <h3 className="panel-title">備份</h3>
              <div className="settings-row">
                <div>
                  <div className="settings-row-title">匯出 / 匯入</div>
                  <div className="settings-row-sub">存成 JSON 檔，換裝置或清瀏覽器前建議備份</div>
                </div>
                <div className="settings-actions">
                  <button className="btn ghost" onClick={exportData}>匯出備份</button>
                  <label className="btn ghost">
                    匯入備份
                    <input type="file" accept="application/json" onChange={importData} hidden />
                  </label>
                </div>
              </div>
            </section>

            <section className="panel">
              <h3 className="panel-title">已刪除</h3>
              <DeletedPanel
                items={deletedHoldings}
                fx={fx} prices={prices} fxRates={fxRates}
                onRestore={restoreHoldings}
                onPurge={purgeHoldings}
              />
            </section>

            <section className="panel danger-panel">
              <h3 className="panel-title">危險區域</h3>
              <div className="settings-row">
                <div>
                  <div className="settings-row-title">清空所有紀錄</div>
                  <div className="settings-row-sub">刪除全部持倉、負債與走勢紀錄，無法復原。會先自動幫你下載一份備份。</div>
                </div>
                <button className="btn danger" onClick={openClear}>清空所有紀錄</button>
              </div>
            </section>

            <p className="footer-note settings-footnote">
              資料存在這台裝置的瀏覽器裡（IndexedDB）{session ? '，並與雲端同步。' : '。'}
            </p>
          </>
        )}
      </main>

      <button className="fab" onClick={openAdd} aria-label="新增持倉或負債">＋</button>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.key} className={'tabbar-btn' + (tab === t.key ? ' on' : '')} onClick={() => setTab(t.key)}>
            <span className="tabbar-icon">{t.icon}</span>
            <span className="tabbar-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {formOpen && (
        <HoldingForm editing={editing} template={template} prices={prices} onSave={save} onClose={() => { setFormOpen(false); setEditing(null); setTemplate(null) }} />
      )}
      {clearOpen && (
        <ConfirmClearModal busy={clearing} onConfirm={confirmClear} onExport={exportData} onClose={() => setClearOpen(false)} />
      )}
    </div>
  )
}
