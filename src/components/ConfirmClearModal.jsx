import { useState } from 'react'

const CONFIRM_WORD = '刪除'

export default function ConfirmClearModal({ onConfirm, onClose, onExport, busy }) {
  const [text, setText] = useState('')
  const ready = text.trim() === CONFIRM_WORD

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span />
          <h2>清空所有紀錄</h2>
          <button className="icon-btn" onClick={onClose} aria-label="關閉">✕</button>
        </div>

        <p className="hint danger-text">
          這會刪除所有持倉、負債與走勢紀錄（已同步的話，雲端也會一併清空），且<b>無法復原</b>。
          設定（匯率偏好等）不受影響。建議先匯出備份，救援用。
        </p>

        <button className="btn ghost export-btn" onClick={onExport}>先匯出備份</button>

        <label className="field">
          <span>請輸入「{CONFIRM_WORD}」以確認</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={CONFIRM_WORD} autoFocus />
        </label>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn danger" onClick={onConfirm} disabled={!ready || busy}>
            {busy ? '清空中…' : '確認清空'}
          </button>
        </div>
      </div>
    </div>
  )
}
