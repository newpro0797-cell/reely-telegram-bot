import { useState } from 'react';
import { RefreshCw, Check, Edit3, Gem } from 'lucide-react';

export default function ScriptCard({ script, title, estimatedCredits, onApprove, onRegenerate, loading }) {
    const [editing, setEditing] = useState(false);
    const [editedScript, setEditedScript] = useState(script);

    const handleApprove = () => {
        onApprove(editing ? editedScript : null);
    };

    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                    <span>📝</span> Your Script
                </div>
                {title && (
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">"{title}"</p>
                )}
            </div>

            <div className="p-5">
                {editing ? (
                    <textarea
                        value={editedScript}
                        onChange={(e) => setEditedScript(e.target.value)}
                        className="editable-text min-h-[120px]"
                        autoFocus
                    />
                ) : (
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-wrap">
                        {script}
                    </p>
                )}

                <button
                    onClick={() => setEditing(!editing)}
                    className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline font-medium"
                >
                    <Edit3 size={12} />
                    {editing ? 'Preview' : 'Click to edit'}
                </button>
            </div>

            <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
                    <Gem size={14} className="text-[var(--color-primary)]" />
                    Estimated cost: <span className="font-semibold text-[var(--color-primary)]">{estimatedCredits} credits</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onRegenerate}
                        disabled={loading}
                        className="btn-secondary text-xs py-2 px-3"
                    >
                        <RefreshCw size={14} /> Regenerate
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={loading}
                        className="btn-primary text-xs py-2 px-3"
                    >
                        <Check size={14} /> Approve Script
                    </button>
                </div>
            </div>
        </div>
    );
}
