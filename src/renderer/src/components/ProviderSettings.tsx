import { ProviderSetupPanel, type ProviderSetupPanelProps } from "./ProviderSetupPanel";

type Props = ProviderSetupPanelProps & {
  onClose: () => void;
};

/** Modal wrapper — prefer Provider tab in the main layout for setup. */
export function ProviderSettings({ onClose, ...panel }: Props) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal provider-settings-modal">
        <div className="provider-modal-header">
          <h2>Ollama Setup</h2>
          <button type="button" className="secondary small-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <ProviderSetupPanel {...panel} />
      </div>
    </div>
  );
}
