import { useMemo } from "react";
import type { ContinuityInspectorReport } from "@shared/types";

type Props = {
  open: boolean;
  report: ContinuityInspectorReport | null;
  onClose: () => void;
};

export function ContinuityInspectorModal({ open, report, onClose }: Props) {
  const contextPreview = useMemo(() => {
    if (!report?.contextAssemblyPreview) return "No preview available.";
    return report.contextAssemblyPreview.slice(0, 4000);
  }, [report?.contextAssemblyPreview]);

  if (!open) return null;
  return (
    <div className="continuity-inspector-overlay" role="dialog" aria-label="Continuity Inspector">
      <div className="continuity-inspector-modal">
        <div className="continuity-inspector-header">
          <h3>Continuity Inspector (Dev)</h3>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {!report ? (
          <p className="muted">Inspector data unavailable.</p>
        ) : (
          <div className="continuity-inspector-grid">
            <section>
              <h4>Continuity State</h4>
              <pre>{JSON.stringify(report.continuityState, null, 2)}</pre>
            </section>
            <section>
              <h4>Active Fragments</h4>
              <pre>{JSON.stringify(report.activeFragments.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>Autosave / Savepoints</h4>
              <pre>{JSON.stringify(report.savepoints.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>User Profile Memory</h4>
              <pre>{JSON.stringify(report.userProfileMemory.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>Retrieved Context</h4>
              <pre>{JSON.stringify(report.retrievedContext.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>Compression Candidates</h4>
              <pre>{JSON.stringify(report.compressionCandidates.slice(0, 20), null, 2)}</pre>
            </section>
            <section>
              <h4>Context Assembly Preview</h4>
              <pre>{contextPreview}</pre>
            </section>
            <section>
              <h4>Runtime Context Size</h4>
              <pre>{`${report.runtimeContextSizeEstimate} estimated tokens`}</pre>
            </section>
            <section>
              <h4>Recovery Checkpoints</h4>
              <pre>{JSON.stringify(report.recoveryCheckpoints.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>Savepoint Integrity</h4>
              <pre>{JSON.stringify(report.savepointIntegrity, null, 2)}</pre>
            </section>
            <section>
              <h4>Runtime Health</h4>
              <pre>{JSON.stringify(report.runtimeHealth, null, 2)}</pre>
            </section>
            <section>
              <h4>Provider Runtime</h4>
              <pre>{JSON.stringify(report.providerRuntimeState, null, 2)}</pre>
            </section>
            <section>
              <h4>Reconstruction Latency</h4>
              <pre>{`${report.reconstructionLatencyMs} ms`}</pre>
            </section>
            <section>
              <h4>Continuity Cache</h4>
              <pre>{JSON.stringify(report.continuityCacheStats, null, 2)}</pre>
            </section>
            <section>
              <h4>Drift Timeline</h4>
              <pre>{JSON.stringify(report.driftTimeline.slice(0, 12), null, 2)}</pre>
            </section>
            <section>
              <h4>Retrieval Saturation</h4>
              <pre>{JSON.stringify(report.retrievalSaturationIndicators, null, 2)}</pre>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
