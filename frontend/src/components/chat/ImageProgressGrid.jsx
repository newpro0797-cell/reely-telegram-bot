import { Loader2, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export default function ImageProgressGrid({ scenes, onRetryScene, loading }) {
    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                    <span>🖼️</span> Generating {scenes.length} images...
                </div>
            </div>

            <div className="p-5">
                <div className="scene-grid">
                    {scenes.map((scene) => (
                        <div
                            key={scene.scene_number}
                            className="relative aspect-[9/16] rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-subtle)]"
                        >
                            {scene.status === 'complete' && scene.image_url ? (
                                <img
                                    src={scene.image_url}
                                    alt={`Scene ${scene.scene_number}`}
                                    className="w-full h-full object-cover"
                                />
                            ) : scene.status === 'failed' ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 p-3">
                                    <XCircle size={24} className="text-[var(--color-danger)]" />
                                    <span className="text-xs text-[var(--color-danger)] text-center">Failed</span>
                                    <button
                                        onClick={() => onRetryScene(scene.scene_number)}
                                        disabled={loading}
                                        className="btn-secondary text-xs py-1 px-2"
                                    >
                                        <RefreshCw size={12} /> Retry
                                    </button>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-2">
                                    <Loader2 size={24} className="text-[var(--color-primary)] animate-spin-slow" />
                                    <span className="text-xs text-[var(--color-text-muted)]">Scene {scene.scene_number}</span>
                                </div>
                            )}

                            {/* Scene number overlay */}
                            <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center font-bold">
                                {scene.scene_number}
                            </div>

                            {scene.status === 'complete' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 size={18} className="text-[var(--color-success)] drop-shadow-lg" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
