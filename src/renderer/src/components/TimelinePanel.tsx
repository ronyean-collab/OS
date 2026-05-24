import type { TimelineGroup } from "@shared/types";

type Props = {
  groups: TimelineGroup[];
};

export function TimelinePanel({ groups }: Props) {
  return (
    <section className="ops-panel timeline-panel">
      <h2>Timeline</h2>
      {groups.length === 0 && <p className="muted">No continuity events yet.</p>}
      {groups.map((group) => (
        <div key={group.label} className="timeline-group">
          <h3 className="timeline-group-label">{group.label}</h3>
          <ul className="timeline-group-list">
            {group.events.map((evt) => (
              <li key={evt.id}>
                <div className="timeline-event-head">
                  <strong>{evt.humanLabel}</strong>
                  <time>{evt.relativeTime}</time>
                </div>
                {evt.description && (
                  <p className="timeline-event-desc">{evt.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
