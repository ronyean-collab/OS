type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
  testId?: string;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  disabled,
  testId,
}: Props) {
  return (
    <div className="empty-state" data-testid={testId}>
      <h3>{title}</h3>
      <p className="muted small">{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="small-btn" disabled={disabled} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
