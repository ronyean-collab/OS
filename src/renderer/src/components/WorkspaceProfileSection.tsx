import { useEffect, useState } from "react";
import type { Workspace } from "@shared/types";
import { WORKSPACE_PROFILE_EMPTY } from "@shared/consumer-experience-copy";

type Props = {
  workspace: Workspace | null;
  onSave: (patch: { name?: string; description?: string | null }) => Promise<void>;
};

export function WorkspaceProfileSection({ workspace, onSave }: Props) {
  const [name, setName] = useState(workspace?.name ?? "");
  const [description, setDescription] = useState(workspace?.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(workspace?.name ?? "");
    setDescription(workspace?.description ?? "");
  }, [workspace?.id, workspace?.name, workspace?.description]);

  if (!workspace) {
    return <p className="muted small">{WORKSPACE_PROFILE_EMPTY}</p>;
  }

  const dirty =
    name.trim() !== workspace.name ||
    (description.trim() || null) !== (workspace.description ?? null);

  return (
    <section className="workspace-profile-section" data-testid="workspace-profile">
      <h3>Appearance</h3>
      <p className="muted small">How this workspace appears in the sidebar and header.</p>
      <label className="workspace-profile-field">
        <span>Workspace name</span>
        <input
          type="text"
          value={name}
          maxLength={120}
          data-testid="workspace-name-input"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="workspace-profile-field">
        <span>Description</span>
        <textarea
          value={description}
          maxLength={500}
          rows={2}
          placeholder="Optional — a short note for yourself"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="small-btn"
        disabled={!dirty || saving}
        data-testid="workspace-profile-save"
        onClick={() => {
          setSaving(true);
          void onSave({
            name: name.trim(),
            description: description.trim() || null,
          }).finally(() => setSaving(false));
        }}
      >
        {saving ? "Saving…" : "Save appearance"}
      </button>
    </section>
  );
}
