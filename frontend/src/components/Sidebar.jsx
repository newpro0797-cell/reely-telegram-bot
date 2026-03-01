import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Film, Activity, Settings, Play, LogOut, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Sidebar() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    async function handleSignOut() {
        try {
            await signOut();
            navigate('/');
        } catch (err) {
            toast.error('Sign out failed');
        }
    }

    const navLinks = [
        { path: '/', label: 'Overview', icon: <Activity size={18} /> },
        { path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
        { path: '/playground', label: 'Playground', icon: <Play size={18} /> }
    ];

    return (
        <div className="sidebar w-[260px] flex flex-col h-full shrink-0">
            {/* Logo */}
            <div className="p-4 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-primary)] flex items-center justify-center">
                    <Film size={16} className="text-white" />
                </div>
                <span className="text-lg font-bold text-[var(--color-text)]">Reely Admin</span>
            </div>

            {/* Navigation List */}
            <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2">
                {navLinks.map((link) => {
                    const isActive = location.pathname === link.path;
                    return (
                        <button
                            key={link.path}
                            onClick={() => navigate(link.path)}
                            className={`w-full text-left rounded-lg px-4 py-3 flex items-center gap-3 transition-all text-sm ${isActive
                                ? 'bg-[var(--color-primary-50)] text-[var(--color-primary)] font-medium'
                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)]'
                                }`}
                        >
                            {link.icon}
                            <span>{link.label}</span>
                        </button>
                    );
                })}
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
