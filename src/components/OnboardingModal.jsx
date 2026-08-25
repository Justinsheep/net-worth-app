import { useState } from 'react'
import { IconGlyph } from '../icons'

const SLIDES = [
  {
    icon: 'wallet',
    color: '#0FB5A3',
    title: '歡迎使用我的總資產',
    desc: '把股票、加密貨幣、現金、銀行、負債通通放在一起，隨時知道自己身家多少。',
  },
  {
    icon: 'chartUp',
    color: '#2F80B4',
    title: '總覽一眼看清',
    desc: '淨資產、資產配置、走勢，打開 App 第一眼就看到重點。',
  },
  {
    icon: 'coin',
    color: '#E19A3C',
    title: '新增很輕鬆',
    desc: '右下角「＋」，選分類、打代號，數量金額還能直接用內建計算機算。',
  },
  {
    icon: 'bank',
    color: '#5B78E5',
    title: '細項點得進去',
    desc: '每檔股票、每家銀行都能點進詳細頁，看交易明細、加碼、編輯。',
  },
  {
    icon: 'safe',
    color: '#12A67A',
    title: '想簡單就簡單',
    desc: '設定裡有「簡易版」可以切換，只看資產現值；也能登入 Google 跨裝置同步。',
  },
]

export default function OnboardingModal({ onFinish }) {
  const [step, setStep] = useState(0)
  const last = step === SLIDES.length - 1
  const s = SLIDES[step]

  return (
    <div className="onboard-backdrop">
      <button className="onboard-skip" onClick={onFinish}>略過</button>

      <div className="onboard-card" key={step}>
        <div className="onboard-icon" style={{ color: s.color, background: `${s.color}22` }}>
          <IconGlyph name={s.icon} />
        </div>
        <h2 className="onboard-title">{s.title}</h2>
        <p className="onboard-desc">{s.desc}</p>
      </div>

      <div className="onboard-foot">
        <div className="onboard-dots">
          {SLIDES.map((_, i) => (
            <span key={i} className={'onboard-dot' + (i === step ? ' on' : '')} />
          ))}
        </div>
        <button className="btn primary onboard-next" onClick={() => (last ? onFinish() : setStep(step + 1))}>
          {last ? '開始使用' : '下一步'}
        </button>
      </div>
    </div>
  )
}
