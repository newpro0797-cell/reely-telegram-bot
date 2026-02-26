import { Download, RefreshCw, Gem } from 'lucide-react';

export default function VideoReadyCard({ videoUrl, title, totalScenes, duration, creditsUsed, scenes, onCreateAnother }) {
    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-success)]">
                    <span>✅</span> Your Reel is Ready!
                </div>
            </div>

            <div className="p-5 space-y-4">
                {/* Video Player */}
                {videoUrl && (
                    <div className="video-container mx-auto max-w-[280px]">
                        <video controls preload="metadata">
                            <source src={videoUrl} type="video/mp4" />
                            Your browser does not support video.
                        </video>
                    </div>
                )}

                {/* Info */}
                <div className="text-center">
                    <h3 className="font-semibold text-[var(--color-text)]">
                        🎬 {title || 'Your Reel'}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                        {totalScenes} scenes · {duration?.toFixed(1)}s · {creditsUsed} credits used
                    </p>
                </div>

                {/* Scene Thumbnails */}
                {scenes && scenes.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-2">
                        {scenes.map((scene) => (
                            scene.image_url && (
                                <img
                                    key={scene.scene_number}
                                    src={scene.image_url}
                                    alt={`Scene ${scene.scene_number}`}
                                    className="w-12 h-20 rounded-lg object-cover shrink-0 border border-[var(--color-border)]"
                                />
                            )
                        ))}
                    </div>
                )}
            </div>

            <div className="px-5 py-4 border-t border-[var(--color-border)] flex justify-center gap-3">
                {videoUrl && (
                    <a
                        href={videoUrl}
                        download={`${title || 'reel'}.mp4`}
                        className="btn-primary py-2.5 px-5"
                    >
                        <Download size={16} /> Download MP4
                    </a>
                )}
                <button
                    onClick={onCreateAnother}
                    className="btn-secondary py-2.5 px-5"
                >
                    <RefreshCw size={16} /> Create Another
                </button>
            </div>
        </div>
    );
}
