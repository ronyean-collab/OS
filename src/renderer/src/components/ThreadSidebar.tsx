import { useEffect, useRef, useState } from "react";
import type { Thread } from "@shared/types";
import { THREAD_EMPTY_COPY } from "@shared/consumer-experience-copy";
import { ThreadDeleteConfirm } from "./ThreadDeleteConfirm";

type Props = {
  threads: Thread[];
  activeThreadId: string | null;
  disabled?: boolean;
  showArchived: boolean;
  showDeleted: boolean;
  onToggleShowArchived: (value: boolean) => void;
  onToggleShowDeleted: (value: boolean) => void;
  onSelect: (thread: Thread) => void;
  onCreate: () => void;
  onRename: (threadId: string, title: string) => void;
  onMoveUp: (threadId: string) => void;
  onMoveDown: (threadId: string) => void;
  onArchive: (threadId: string) => void;
  onUnarchive: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onRestore: (threadId: string) => void;
};

function formatThreadTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function threadBadge(thread: Thread): string | null {
  if (thread.deletedAt) return "Deleted";
  if (thread.archivedAt) return "Archived";
  return null;
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  disabled,
  showArchived,
  showDeleted,
  onToggleShowArchived,
  onToggleShowDeleted,
  onSelect,
  onCreate,
  onRename,
  onMoveUp,
  onMoveDown,
  onArchive,
  onUnarchive,
  onDelete,
  onRestore,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Thread | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuThreadId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const startRename = (thread: Thread) => {
    setMenuThreadId(null);
    setEditingId(thread.id);
    setEditTitle(thread.title);
  };

  const commitRename = (threadId: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRename(threadId, trimmed);
    }
    setEditingId(null);
  };

  const visibleThreads = threads.filter((t) => {
    if (t.deletedAt) return showDeleted;
    if (t.archivedAt) return showArchived;
    return true;
  });

  return (
    <nav className="thread-sidebar" aria-label="Threads" data-testid="thread-sidebar">
      <div className="thread-sidebar-header">
        <h2>Conversations</h2>
        <button type="button" data-testid="create-thread" onClick={onCreate} disabled={disabled}>
          New
        </button>
      </div>

      <details className="thread-sidebar-filters">
        <summary className="thread-sidebar-filters-summary">More thread views</summary>
        <div className="thread-sidebar-toggles">
          <label className="thread-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => onToggleShowArchived(e.target.checked)}
              disabled={disabled}
            />
            Show archived
          </label>
          <label className="thread-toggle">
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(e) => onToggleShowDeleted(e.target.checked)}
              disabled={disabled}
            />
            Show deleted
          </label>
        </div>
      </details>

      <ul className="thread-list">
        {visibleThreads.length === 0 && (
          <li className="empty-threads-state">
            <p className="muted">
              {showArchived || showDeleted
                ? THREAD_EMPTY_COPY.filtered
                : THREAD_EMPTY_COPY.none}
            </p>
            {!showArchived && !showDeleted && (
              <button type="button" className="small-btn" disabled={disabled} onClick={onCreate}>
                {THREAD_EMPTY_COPY.cta}
              </button>
            )}
          </li>
        )}
        {visibleThreads.map((thread) => {
          const badge = threadBadge(thread);
          const isHidden = Boolean(thread.archivedAt || thread.deletedAt);
          return (
            <li key={thread.id} className="thread-list-item">
              {editingId === thread.id ? (
                <input
                  className="thread-rename-input"
                  value={editTitle}
                  autoFocus
                  disabled={disabled}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => commitRename(thread.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(thread.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <div
                  className={`thread-row${activeThreadId === thread.id && !isHidden ? " active-continuity" : ""}`}
                >
                  <button
                    type="button"
                    className={`thread-item ${activeThreadId === thread.id ? "active" : ""} ${isHidden ? "thread-item-hidden" : ""}`}
                    disabled={disabled}
                    onClick={() => onSelect(thread)}
                  >
                    <span className="thread-title">{thread.title}</span>
                    {badge && <span className="thread-badge">{badge}</span>}
                    <time className="thread-time">{formatThreadTime(thread.updatedAt)}</time>
                  </button>
                  <div className="thread-actions-wrap" ref={menuThreadId === thread.id ? menuRef : undefined}>
                    <button
                      type="button"
                      className="thread-actions-btn"
                      aria-label={`Actions for ${thread.title}`}
                      disabled={disabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuThreadId((id) => (id === thread.id ? null : thread.id));
                      }}
                    >
                      ...
                    </button>
                    {menuThreadId === thread.id && (
                      <div className="thread-actions-menu" role="menu">
                        {!thread.deletedAt && (
                          <button type="button" role="menuitem" onClick={() => startRename(thread)}>
                            Rename
                          </button>
                        )}
                        {!thread.deletedAt && !thread.archivedAt && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuThreadId(null);
                                onMoveUp(thread.id);
                              }}
                            >
                              Move up
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuThreadId(null);
                                onMoveDown(thread.id);
                              }}
                            >
                              Move down
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuThreadId(null);
                                onArchive(thread.id);
                              }}
                            >
                              Archive
                            </button>
                          </>
                        )}
                        {thread.archivedAt && !thread.deletedAt && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuThreadId(null);
                              onUnarchive(thread.id);
                            }}
                          >
                            Unarchive
                          </button>
                        )}
                        {thread.deletedAt && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuThreadId(null);
                              onRestore(thread.id);
                            }}
                          >
                            Restore
                          </button>
                        )}
                        {!thread.deletedAt && (
                          <button
                            type="button"
                            role="menuitem"
                            className="danger-text"
                            onClick={() => {
                              setMenuThreadId(null);
                              setPendingDelete(thread);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small thread-hint">Drag chats to reorder. Use the menu for options.</p>

      {pendingDelete && (
        <ThreadDeleteConfirm
          threadTitle={pendingDelete.title}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </nav>
  );
}



