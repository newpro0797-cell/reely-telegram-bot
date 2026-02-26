import { useState } from 'react';
import { Film } from 'lucide-react';

export default function StyleSelectionCard({ onStitch, loading }) {
    const [transition, setTransition] = useState('fade');
    const [animation, setAnimation] = useState('ken_burns');
    const [burnSubtitles, setBurnSubtitles] = useState(false);
    const [aspectRatio, setAspectRatio] = useState('9:16');

    const handleCreate = () => {
        onStitch({ transition, animation, burnSubtitles, aspectRatio });
    };

    const RadioOption = ({ name, value, selected, onChange, label }) => (
        <label
            className={`radio-card flex items-center gap-2 ${selected === value ? 'selected' : ''}`}
        >
            <input
                type="radio"
                name={name}
                value={value}
                checked={selected === value}
                onChange={() => onChange(value)}
                className="sr-only"
            />
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected === value ? 'border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
                {selected === value && <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />}
            </div>
            <span className="text-sm">{label}</span>
        </label>
    );

    return (
        <div className="chat-card">
            <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                    <span>🎬</span> Choose Your Video Style
                </div>
            </div>

            <div className="p-5 space-y-6">
                {/* Transition Effect */}
                <div>
                    <label className="text-sm font-medium text-[var(--color-text)] block mb-2">Transition Effect</label>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { value: 'none', label: 'None' },
                            { value: 'fade', label: 'Fade' },
                            { value: 'slide_left', label: 'Slide Left' },
                            { value: 'slide_right', label: 'Slide Right' },
                            { value: 'zoom_in', label: 'Zoom In' },
                            { value: 'zoom_out', label: 'Zoom Out' },
                        ].map(opt => (
                            <RadioOption key={opt.value} name="transition" value={opt.value} selected={transition} onChange={setTransition} label={opt.label} />
                        ))}
                    </div>
                </div>

                {/* Scene Animation */}
                <div>
                    <label className="text-sm font-medium text-[var(--color-text)] block mb-2">Scene Animation</label>
                    <div className="flex flex-wrap gap-2">
                        <RadioOption name="animation" value="ken_burns" selected={animation} onChange={setAnimation} label="Ken Burns (slow zoom)" />
                        <RadioOption name="animation" value="static" selected={animation} onChange={setAnimation} label="Static" />
                    </div>
                </div>

                {/* Subtitles */}
                <div>
                    <label className="text-sm font-medium text-[var(--color-text)] block mb-2">Subtitles</label>
                    <div className="flex flex-wrap gap-2">
                        <RadioOption name="subtitles" value={false} selected={burnSubtitles} onChange={setBurnSubtitles} label="No Subtitles" />
                        <RadioOption name="subtitles" value={true} selected={burnSubtitles} onChange={setBurnSubtitles} label="Burn Subtitles" />
                    </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                    <label className="text-sm font-medium text-[var(--color-text)] block mb-2">Aspect Ratio</label>
                    <div className="flex flex-wrap gap-2">
                        <RadioOption name="aspect" value="9:16" selected={aspectRatio} onChange={setAspectRatio} label="9:16 Reels" />
                        <RadioOption name="aspect" value="1:1" selected={aspectRatio} onChange={setAspectRatio} label="1:1 Square" />
                        <RadioOption name="aspect" value="16:9" selected={aspectRatio} onChange={setAspectRatio} label="16:9 Landscape" />
                    </div>
                </div>
            </div>

            <div className="px-5 py-4 border-t border-[var(--color-border)] flex justify-end">
                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="btn-primary py-2.5 px-5"
                >
                    <Film size={16} /> Create My Reel
                </button>
            </div>
        </div>
    );
}
