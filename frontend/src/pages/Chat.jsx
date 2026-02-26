import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import ScriptCard from '../components/chat/ScriptCard';
import AudioCard from '../components/chat/AudioCard';
import ImagePromptsCard from '../components/chat/ImagePromptsCard';
import ImageProgressGrid from '../components/chat/ImageProgressGrid';
import StyleSelectionCard from '../components/chat/StyleSelectionCard';
import VideoReadyCard from '../components/chat/VideoReadyCard';
import { Send, Loader2, Bot, User, Film, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_ORDER = [
    'pending', 'generating_script', 'awaiting_script_approval',
    'generating_audio', 'generating_image_prompts',
    'awaiting_prompts_approval', 'generating_images',
    'awaiting_style_selection', 'stitching', 'complete', 'failed'
];

function ThinkingBubble({ text }) {
    return (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] animate-fade-in">
            <Loader2 size={16} className="text-[var(--color-primary)] animate-spin-slow" />
            {text}
        </div>
    );
}

export default function Chat() {
    const { sessionId: paramSessionId } = useParams();
    const navigate = useNavigate();
    const { user, refreshProfile } = useAuth();
    const [sessionId, setSessionId] = useState(paramSessionId || null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const chatEndRef = useRef(null);

    // Load session jobs on mount / session change
    useEffect(() => {
        if (sessionId) {
            loadSessionJobs();
        }
    }, [sessionId]);

    // Realtime subscription for active jobs
    useEffect(() => {
        if (!sessionId) return;

        const channel = supabase
            .channel(`session-${sessionId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'reel_jobs',
                filter: `session_id=eq.${sessionId}`,
            }, async (payload) => {
                const updated = payload.new;

                setMessages(prev => prev.map(m => {
                    if (m.type === 'job' && m.job?.id === updated.id) {
                        return { ...m, job: updated };
                    }
                    return m;
                }));

                // If complete, fetch video URL and scenes
                if (updated.status === 'complete') {
                    try {
                        const [videoData, scenes] = await Promise.all([
                            apiGet(`/jobs/${updated.id}/video-url`),
                            apiGet(`/jobs/${updated.id}/scenes`),
                        ]);
                        setMessages(prev => prev.map(m => {
                            if (m.type === 'job' && m.job?.id === updated.id) {
                                return { ...m, job: updated, videoUrl: videoData.signedUrl, scenes };
                            }
                            return m;
                        }));
                        refreshProfile();
                    } catch (e) {
                        console.error('Failed to fetch results', e);
                    }
                }

                // If awaiting_prompts_approval or awaiting_style_selection, fetch scenes
                if (updated.status === 'awaiting_prompts_approval' || updated.status === 'generating_images' || updated.status === 'awaiting_style_selection') {
                    try {
                        const scenes = await apiGet(`/jobs/${updated.id}/scenes`);
                        setMessages(prev => prev.map(m => {
                            if (m.type === 'job' && m.job?.id === updated.id) {
                                return { ...m, scenes };
                            }
                            return m;
                        }));
                    } catch (e) { /* ignore */ }
                }
            })
            .subscribe();

        // Also subscribe to scene updates
        const sceneChannel = supabase
            .channel(`scenes-${sessionId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'reel_scenes',
            }, async (payload) => {
                // Refresh scenes for the relevant job
                const updated = payload.new;
                if (updated.job_id) {
                    try {
                        const scenes = await apiGet(`/jobs/${updated.job_id}/scenes`);
                        setMessages(prev => prev.map(m => {
                            if (m.type === 'job' && m.job?.id === updated.job_id) {
                                return { ...m, scenes };
                            }
                            return m;
                        }));
                    } catch (e) { /* ignore */ }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(sceneChannel);
        };
    }, [sessionId]);

    // Auto-scroll
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    async function loadSessionJobs() {
        try {
            const session = await apiGet(`/sessions/${sessionId}`);
            const msgs = [];

            for (const job of (session.jobs || [])) {
                // User message
                msgs.push({
                    type: 'user',
                    content: job.prompt,
                    timestamp: job.created_at,
                });

                // Job card
                const jobMsg = {
                    type: 'job',
                    job,
                    timestamp: job.created_at,
                    videoUrl: null,
                    scenes: null,
                };

                // Fetch scenes/video for completed or in-progress jobs
                if (job.status === 'complete' && job.video_storage_path) {
                    try {
                        const [videoData, scenes] = await Promise.all([
                            apiGet(`/jobs/${job.id}/video-url`),
                            apiGet(`/jobs/${job.id}/scenes`),
                        ]);
                        jobMsg.videoUrl = videoData.signedUrl;
                        jobMsg.scenes = scenes;
                    } catch (e) { /* ignore */ }
                } else if (['awaiting_prompts_approval', 'generating_images', 'awaiting_style_selection'].includes(job.status)) {
                    try {
                        jobMsg.scenes = await apiGet(`/jobs/${job.id}/scenes`);
                    } catch (e) { /* ignore */ }
                }

                msgs.push(jobMsg);
            }

            setMessages(msgs);
        } catch (err) {
            console.error('Failed to load session', err);
        }
    }

    async function handleSend() {
        if (!input.trim() || sending) return;
        const prompt = input.trim();
        setInput('');
        setSending(true);

        try {
            // Create session if needed
            let sid = sessionId;
            if (!sid) {
                const session = await apiPost('/sessions', { title: prompt.substring(0, 60) });
                sid = session.id;
                setSessionId(sid);
                navigate(`/chat/${sid}`, { replace: true });
            }

            // Add user message
            setMessages(prev => [...prev, {
                type: 'user',
                content: prompt,
                timestamp: new Date().toISOString(),
            }]);

            // Create job
            const { jobId } = await apiPost('/jobs', { sessionId: sid, prompt });

            // Add job message placeholder
            setMessages(prev => [...prev, {
                type: 'job',
                job: { id: jobId, status: 'generating_script', prompt },
                timestamp: new Date().toISOString(),
                videoUrl: null,
                scenes: null,
            }]);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setSending(false);
        }
    }

    async function handleApproveScript(jobId, editedScript) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/approve-script`, { editedScript });
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRegenerateScript(jobId) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/regenerate-script`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleApprovePrompts(jobId, editedPrompts) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/approve-prompts`, { editedPrompts });
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRegeneratePrompts(jobId) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/regenerate-prompts`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleRetryScene(jobId, sceneNum) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/retry-scene/${sceneNum}`);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleStitch(jobId, options) {
        setActionLoading(true);
        try {
            await apiPost(`/jobs/${jobId}/stitch`, options);
        } catch (err) {
            toast.error(err.message);
        } finally {
            setActionLoading(false);
        }
    }

    function calculateCredits(totalScenes) {
        return 9 + (totalScenes * 5);
    }

    function renderJobCard(msg) {
        const { job, videoUrl, scenes } = msg;
        if (!job) return null;

        const { status } = job;

        return (
            <div className="space-y-3 max-w-[560px] animate-fade-in">
                {/* Generating script */}
                {status === 'generating_script' && (
                    <ThinkingBubble text="✍️ Writing your narration script..." />
                )}

                {/* Script approval */}
                {status === 'awaiting_script_approval' && job.narration_script && (
                    <ScriptCard
                        script={job.narration_script}
                        title={job.video_title}
                        estimatedCredits={job.total_scenes ? calculateCredits(job.total_scenes) : '~39'}
                        onApprove={(edited) => handleApproveScript(job.id, edited)}
                        onRegenerate={() => handleRegenerateScript(job.id)}
                        loading={actionLoading}
                    />
                )}

                {/* Generating audio */}
                {status === 'generating_audio' && (
                    <ThinkingBubble text="🎙️ Generating voiceover..." />
                )}

                {/* Generating image prompts */}
                {status === 'generating_image_prompts' && (
                    <ThinkingBubble text="🖼️ Creating scene prompts..." />
                )}

                {/* Audio + prompts approval */}
                {status === 'awaiting_prompts_approval' && (
                    <>
                        {job.audio_duration_seconds && (
                            <AudioCard
                                duration={job.audio_duration_seconds}
                                totalScenes={job.total_scenes}
                            />
                        )}
                        {scenes && scenes.length > 0 && (
                            <ImagePromptsCard
                                scenes={scenes}
                                onApprove={(edited) => handleApprovePrompts(job.id, edited)}
                                onRegenerate={() => handleRegeneratePrompts(job.id)}
                                loading={actionLoading}
                            />
                        )}
                    </>
                )}

                {/* Generating images */}
                {status === 'generating_images' && scenes && (
                    <ImageProgressGrid
                        scenes={scenes}
                        onRetryScene={(num) => handleRetryScene(job.id, num)}
                        loading={actionLoading}
                    />
                )}

                {/* Style selection */}
                {status === 'awaiting_style_selection' && (
                    <>
                        {scenes && (
                            <ImageProgressGrid
                                scenes={scenes}
                                onRetryScene={(num) => handleRetryScene(job.id, num)}
                                loading={actionLoading}
                            />
                        )}
                        <StyleSelectionCard
                            onStitch={(opts) => handleStitch(job.id, opts)}
                            loading={actionLoading}
                        />
                    </>
                )}

                {/* Stitching */}
                {status === 'stitching' && (
                    <div className="chat-card p-5">
                        <ThinkingBubble text="🎬 Stitching your reel... this takes ~30 seconds" />
                        <div className="mt-3 progress-bar progress-bar-animated">
                            <div className="progress-bar-fill" style={{ width: '60%' }} />
                        </div>
                    </div>
                )}

                {/* Complete */}
                {status === 'complete' && (
                    <VideoReadyCard
                        videoUrl={videoUrl}
                        title={job.video_title}
                        totalScenes={job.total_scenes}
                        duration={job.audio_duration_seconds}
                        creditsUsed={job.credits_deducted}
                        scenes={scenes}
                        onCreateAnother={() => setInput('')}
                    />
                )}

                {/* Failed */}
                {status === 'failed' && (
                    <div className="chat-card p-5 border-[var(--color-danger)]/30">
                        <p className="text-sm text-[var(--color-danger)] font-medium">Pipeline failed</p>
                        {job.error_message && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">{job.error_message}</p>
                        )}
                        <button
                            onClick={() => handleRegenerateScript(job.id)}
                            className="btn-secondary text-xs py-2 px-3 mt-3"
                        >
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] lg:h-screen">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
                <div className="max-w-[680px] mx-auto space-y-6">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center">
                            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-100)] flex items-center justify-center mb-4">
                                <Sparkles size={32} className="text-[var(--color-primary)]" />
                            </div>
                            <h3 className="text-xl font-semibold text-[var(--color-text)]">Create a new reel</h3>
                            <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-md">
                                Describe your reel below. For example: "Make a 30-second reel about the future of AI"
                            </p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.type === 'user' ? 'justify-end' : ''}`}>
                            {msg.type !== 'user' && (
                                <div className="w-8 h-8 rounded-full bg-[var(--color-primary-100)] flex items-center justify-center shrink-0 mt-1">
                                    <Bot size={16} className="text-[var(--color-primary)]" />
                                </div>
                            )}

                            <div className={`${msg.type === 'user' ? '' : 'flex-1'}`}>
                                {msg.type === 'user' ? (
                                    <div className="chat-bubble-user">{msg.content}</div>
                                ) : msg.type === 'job' ? (
                                    renderJobCard(msg)
                                ) : null}
                            </div>

                            {msg.type === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0 mt-1">
                                    <User size={16} className="text-white" />
                                </div>
                            )}
                        </div>
                    ))}
                    <div ref={chatEndRef} />
                </div>
            </div>

            {/* Input */}
            <div className="shrink-0 p-4 border-t border-[var(--color-border)] bg-white">
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex gap-3 max-w-[680px] mx-auto"
                >
                    <input
                        id="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Describe your reel... e.g. Make a 30-second reel about space exploration"
                        className="input-field flex-1 py-3 px-4 rounded-2xl"
                        disabled={sending}
                    />
                    <button
                        id="chat-send"
                        type="submit"
                        disabled={!input.trim() || sending}
                        className="btn-primary px-4 rounded-2xl"
                    >
                        {sending ? (
                            <Loader2 size={18} className="animate-spin-slow" />
                        ) : (
                            <Send size={18} />
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
