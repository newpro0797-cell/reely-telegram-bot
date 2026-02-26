import { useState } from 'react';
import { RefreshCw, Image, Edit3 } from 'lucide-react';

export default function ImagePromptsCard({ scenes, onApprove, onRegenerate, loading }) {
    const [editedPrompts, setEditedPrompts] = useState(
        scenes.map(s => ({ scene_number: s.scene_number, image_prompt: s.image_prompt }))
    );
    const [editing, setEditing] = useState(false);

    const updatePrompt = (idx, value) => {
        setEditedPrompts(prev => prev.map((p, i) => i === idx ? { ...p, image_prompt: value } : p));
    };

    const handleApprove = () => {
        onApprove(editing ? editedPrompts : null);
    };

    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                        <span>🖼️</span> Scene Prompts
                    </div>
                    <button
                        onClick={() => setEditing(!editing)}
                        className="flex items-center gap-1.5 text-xs text-[var(--color-primary)] hover:underline font-medium"
                    >
                        <Edit3 size={12} />
                        {editing ? 'Preview' : 'Edit prompts'}
                    </button>
                </div>
            </div>

            <div className="p-5 space-y-3 max-h-[400px] overflow-y-auto">
                {editedPrompts.map((prompt, idx) => (
                    <div key={idx} className="flex gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-100)] text-[var(--color-primary)] flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                            {prompt.scene_number}
                        </div>
                        {editing ? (
                            <textarea
                                value={prompt.image_prompt}
                                onChange={(e) => updatePrompt(idx, e.target.value)}
                                className="editable-text text-sm flex-1 min-h-[60px]"
                            />
                        ) : (
                            <p className="text-sm text-[var(--color-text-secondary)] flex-1 leading-relaxed">
                                {prompt.image_prompt}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <div className="px-5 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
                <button
                    onClick={onRegenerate}
                    disabled={loading}
                    className="btn-secondary text-xs py-2 px-3"
                >
                    <RefreshCw size={14} /> Regenerate Prompts
                </button>
                <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="btn-primary text-xs py-2 px-3"
                >
                    <Image size={14} /> Generate Images
                </button>
            </div>
        </div>
    );
}
