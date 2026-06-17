import { createPortal } from "react-dom";

type Props = {
  threadTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ThreadDeleteConfirm({ threadTitle, onCancel, onConfirm }: Props) {
  return createPortal(
    <div
      className="modal-backdrop thread-delete-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="modal thread-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="thread-delete-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">Conversation</p>
        <h2 id="thread-delete-title">Delete thread?</h2>
        <p className="muted">
          Delete <strong>{threadTitle}</strong>? Messages will be hidden but preserved for recovery.
        </p>
        <div className="modal-actions thread-delete-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Delete thread
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
