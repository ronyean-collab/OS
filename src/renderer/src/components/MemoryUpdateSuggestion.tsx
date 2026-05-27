type Props = {
  visible: boolean;
  onPreview: () => void;
  onDismiss: () => void;
};

export function MemoryUpdateSuggestion({ visible, onPreview, onDismiss }: Props) {
  if (!visible) return null;

  return (
    <div className="memory-update-suggestion" role="status" aria-live="polite">
      <span className="memory-update-suggestion-text">Want to update project memory?</span>
      <div className="memory-update-suggestion-actions">
        <button type="button" className="small-btn" onClick={onPreview}>
          Preview Update
        </button>
        <button type="button" className="secondary small-btn" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
