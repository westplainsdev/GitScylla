interface Props {
  title: string
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="modal-hint">{body}</div>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary danger" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
