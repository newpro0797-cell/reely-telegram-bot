import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Film, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignIn() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signIn } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signIn(email, password);
            toast.success('Welcome back!');
            navigate('/chat');
        } catch (err) {
            toast.error(err.message || 'Sign in failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-subtle)] p-4">
            <div className="w-full max-w-md space-y-8 animate-fade-in">
                {/* Logo */}
                <div className="text-center">
                    <Link to="/" className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-primary)] mb-4">
                        <Film size={28} className="text-white" />
                    </Link>
                    <h1 className="text-3xl font-bold text-[var(--color-text)]">Welcome back</h1>
                    <p className="mt-2 text-[var(--color-text-secondary)]">Sign in to your Reely account</p>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                            Email address
                        </label>
                        <input
                            id="signin-email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field"
                            placeholder="you@example.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                            Password
                        </label>
                        <input
                            id="signin-password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        id="signin-submit"
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full py-3"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin-slow" /> : null}
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-sm text-[var(--color-text-secondary)]">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-[var(--color-primary)] hover:underline font-medium">
                        Create one
                    </Link>
                </p>
            </div>
        </div>
    );
}
