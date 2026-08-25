import { ICON_LIST, IconGlyph } from '../icons'

export default function IconPicker({ value, category, subtype, onChange }) {
  return (
    <div className="icon-picker">
      {ICON_LIST.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={'icon-choice' + (value === key ? ' on' : '')}
          onClick={() => onChange(value === key ? '' : key)}
          title={label}
          aria-label={label}
        >
          <IconGlyph name={key} category={category} subtype={subtype} />
        </button>
      ))}
    </div>
  )
}
