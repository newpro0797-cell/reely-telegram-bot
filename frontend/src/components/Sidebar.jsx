import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { Film, Plus, MessageSquare, Gem, LogOut, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Sidebar() {
    const { user, credits, signOut, refreshProfile } = useAuth();
    const { sessionId: activeSessionId } = useParams();
    const navigate = useNavigate();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSessions();
    }, []);

    async function loadSessions() {
        try {
            const data = await apiGet('/sessions');
            setSessions(data);
        } catch (err) {
            console.error('Failed to load sessions', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleNew() {
        navigate('/chat');
    }

    async function handleDelete(e, id) {
        e.stopPropagation();
        try {
            await apiDelete(`/sessions/${id}`);
            setSessions(prev => prev.filter(s => s.id !== id));
            if (activeSessionId === id) {
                navigate('/chat');
            }
            toast.success('Session deleted');
        } catch (err) {
            toast.error(err.message);
        }
    }

    async function handleSignOut() {
        try {
            await signOut();
            navigate('/');
        } catch (err) {
            toast.error('Sign out failed');
        }
    }

    return (
        <div className="sidebar w-[260px] flex flex-col h-full shrink-0">
            {/* Logo */}
            <div className="p-4 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)] flex items-center justify-center">
                    <Film size={16} className="text-white" />
                </div>
                <span className="text-lg font-bold text-[var(--color-text)]">Reely</span>
            </div>

            {/* New Reel */}
            <div className="px-3 mb-2">
                <button
                    onClick={handleNew}
                    className="btn-primary w-full py-2.5 text-sm"
                >
                    <Plus size={16} /> New Reel
                </button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto px-2 py-1">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 size={20} className="animate-spin-slow text-[var(--color-text-muted)]" />
                    </div>
                ) : sessions.length === 0 ? (
                    <p className="text-xs text-[var(--color-text-muted)] text-center py-8 px-4">
                        No sessions yet. Send a prompt to get started.
                    </p>
                ) : (
                    sessions.map((session) => {
                        const isActive = activeSessionId === session.id;
                        return (
                            <button
                                key={session.id}
                                onClick={() => navigate(`/chat/${session.id}`)}
                                className={`w-full text-left rounded-lg px-3 py-2.5 mb-0.5 flex items-center gap-2.5 group transition-all text-sm ${isActive
                                        ? 'bg-[var(--color-primary-50)] text-[var(--color-primary)] font-medium'
                                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                                    }`}
                            >
                                <MessageSquare size={14} className="shrink-0 opacity-60" />
                                <span className="flex-1 truncate text-[13px]">{session.title}</span>
                                <button
                                    onClick={(e) => handleDelete(e, session.id)}
                                    className="opacity-0 group-hover:opacity-100 hover:text-[var(--color-danger)] transition-opacity"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Bottom */}
            <div className="p-3 border-t border-[var(--color-border)] space-y-2">
                {/* Credits */}
                <div className="credit-badge justify-center w-full">
                    <Gem size={14} />
                    <span>{credits ?? 0} credits</span>
                </div>

                {/* User / Sign Out */}
                <button
                    onClick={handleSignOut}
                    className="btn-ghost w-full text-xs py-2 justify-center"
                >
                    <LogOut size={14} /> Sign Out
                </button>
            </div>
        </div>
    );
}
