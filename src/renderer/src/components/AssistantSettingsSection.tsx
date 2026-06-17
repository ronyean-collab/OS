import { useEffect, useState } from "react";
import type { AssistantProfile, AssistantProfileUpdate } from "@shared/types";

type Props = {
  profile: AssistantProfile | null;
  onSave: (patch: AssistantProfileUpdate) => Promise<void>;
};

export function AssistantSettingsSection({ profile, onSave }: Props) {
  const [name, setName] = useState(profile?.assistantName ?? "Assistant");
  const [webEnabled, setWebEnabled] = useState(profile?.webEnabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(profile?.assistantName ?? "Assistant");
    setWebEnabled(profile?.webEnabled ?? true);
  }, [profile?.assistantName, profile?.webEnabled, profile?.updatedAt]);

  if (!profile) {
    return <p className="muted small">Loading assistant settings…</p>;
  }

  const dirty =
    name.trim() !== profile.assistantName || webEnabled !== profile.webEnabled;

  return (
    <section className="assistant-settings-section" data-testid="assistant-settings">
      <h3>Assistant</h3>
      <p className="muted small">
        Your assistant keeps the same personality across conversations. It won't constantly use
        its name unless you ask it to.
      </p>
      <label className="workspace-profile-field">
        <span>Assistant name</span>
        <input
          type="text"
          value={name}
          maxLength={64}
          data-testid="assistant-name-input"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="workspace-profile-field assistant-toggle-row">
        <span>Look up current information on the web</span>
        <input
          type="checkbox"
          checked={webEnabled}
          data-testid="assistant-web-toggle"
          onChange={(e) => setWebEnabled(e.target.checked)}
        />
      </label>
      <p className="muted small">
        When this is off, your assistant will say if it needs current information rather than
        guessing.
      </p>
      <button
        type="button"
        className="small-btn"
        disabled={!dirty || saving}
        data-testid="assistant-settings-save"
        onClick={() => {
          setSaving(true);
          void onSave({
            assistantName: name.trim() || "Assistant",
            webEnabled,
          }).finally(() => setSaving(false));
        }}
      >
        {saving ? "Saving…" : "Save assistant"}
      </button>
    </section>
  );
}
