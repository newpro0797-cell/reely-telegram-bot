export default function AudioCard({ duration, totalScenes, audioUrl }) {
    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                    <span>🎙️</span> Voiceover Ready
                </div>
            </div>

            <div className="p-5 space-y-4">
                {audioUrl && (
                    <audio controls className="w-full" style={{ height: 40 }}>
                        <source src={audioUrl} type="audio/wav" />
                        Your browser does not support audio.
                    </audio>
                )}

                <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                    <span>Duration: <strong className="text-[var(--color-text)]">{duration?.toFixed(1)}s</strong></span>
                    <span>·</span>
                    <span><strong className="text-[var(--color-text)]">{totalScenes}</strong> scenes will be created</span>
                </div>
            </div>
        </div>
    );
}
