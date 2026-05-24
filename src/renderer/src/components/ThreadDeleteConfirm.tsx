type Props = {
  threadTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ThreadDeleteConfirm({ threadTitle, onCancel, onConfirm }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal thread-delete-modal">
        <h2>Delete thread?</h2>
        <p className="muted">
          Delete <strong>{threadTitle}</strong>? Messages will be hidden but preserved for
          recovery.
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={onConfirm}>
            Delete thread
          </button>
        </div>
      </div>
    </div>
  );
}
