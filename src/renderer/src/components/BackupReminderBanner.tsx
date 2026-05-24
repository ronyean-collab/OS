type Props = {
  message: string;
  onExport: () => void;
  onDismiss: () => void;
};

export function BackupReminderBanner({ message, onExport, onDismiss }: Props) {
  return (
    <div className="backup-reminder-banner" role="status">
      <p>{message} Export a backup to keep your continuity safe — stored only on this device.</p>
      <div className="backup-reminder-actions">
        <button type="button" onClick={onExport}>
          Export backup
        </button>
        <button type="button" className="secondary" onClick={onDismiss}>
          Remind me later
        </button>
      </div>
    </div>
  );
}
