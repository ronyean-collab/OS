type Props = { message: string };

export function RecoveryBanner({ message }: Props) {
  return (
    <div className="recovery-banner" role="alert">
      <strong>Recovery mode</strong>
      <p>{message}</p>
      <p className="muted small">
        Your local continuity data has been preserved. The app will stay in recovery-safe
        mode until the database can be verified again.
      </p>
    </div>
  );
}
