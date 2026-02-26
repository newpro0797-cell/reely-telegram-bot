import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Film, Loader2, Gift } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SignUp() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        try {
            await signUp(email, password);
            toast.success('Account created! You got 200 free credits 🎉');
            navigate('/chat');
        } catch (err) {
            toast.error(err.message || 'Sign up failed');
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
                    <h1 className="text-3xl font-bold text-[var(--color-text)]">Create Account</h1>
                    <p className="mt-2 text-[var(--color-text-secondary)]">Start creating AI-powered reels</p>
                </div>

                {/* Bonus badge */}
                <div className="flex items-center justify-center">
                    <div className="inline-flex items-center gap-2 bg-[var(--color-primary-50)] border border-[var(--color-primary-200)] text-[var(--color-primary)] rounded-full px-4 py-2 text-sm font-medium">
                        <Gift size={16} />
                        Get 200 free credits on signup
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="card p-8 space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
                            Email address
                        </label>
                        <input
                            id="signup-email"
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
                            id="signup-password"
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="input-field"
                            placeholder="Minimum 6 characters"
                        />
                    </div>

                    <button
                        id="signup-submit"
                        type="submit"
                        disabled={loading}
                        className="btn-primary w-full py-3"
                    >
                        {loading ? <Loader2 size={18} className="animate-spin-slow" /> : null}
                        {loading ? 'Creating account...' : 'Create Account'}
                    </button>
                </form>

                <p className="text-center text-sm text-[var(--color-text-secondary)]">
                    Already have an account?{' '}
                    <Link to="/signin" className="text-[var(--color-primary)] hover:underline font-medium">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
}
