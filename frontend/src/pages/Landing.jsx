import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Film, Sparkles, Image, Video, ArrowRight, Zap, Clock, Shield, MessageSquare } from 'lucide-react';

export default function Landing() {
    const { user } = useAuth();

    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[var(--color-border)]">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[var(--color-primary)] flex items-center justify-center">
                            <Film size={18} className="text-white" />
                        </div>
                        <span className="text-xl font-bold text-[var(--color-text)]">Reely</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {user ? (
                            <Link to="/chat" className="btn-primary">
                                Go to App <ArrowRight size={16} />
                            </Link>
                        ) : (
                            <>
                                <Link to="/signin" className="btn-ghost">Sign In</Link>
                                <Link to="/signup" className="btn-primary">
                                    Get Started <ArrowRight size={16} />
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="hero-gradient py-24 lg:py-32">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-white border border-[var(--color-primary-200)] text-[var(--color-primary)] rounded-full px-4 py-1.5 text-sm font-medium mb-8">
                        <Sparkles size={14} />
                        AI-Powered Video Creation
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-extrabold text-[var(--color-text)] leading-[1.1] tracking-tight">
                        Turn any idea into an
                        <span className="text-[var(--color-primary)]"> Instagram Reel</span> in minutes
                    </h1>
                    <p className="mt-6 text-lg lg:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
                        Just type a prompt. AI writes the script, generates images,
                        adds voiceover, and delivers a ready-to-post MP4.
                    </p>
                    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link to="/signup" className="btn-primary text-lg px-8 py-3.5 rounded-xl shadow-lg shadow-[var(--color-primary)]/20">
                            Start Creating Free — 200 Credits <ArrowRight size={18} />
                        </Link>
                    </div>
                    <p className="mt-4 text-sm text-[var(--color-text-muted)]">
                        No credit card required · 200 free credits on signup
                    </p>
                </div>
            </section>

            {/* Feature Cards */}
            <section className="py-20 bg-white">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)]">
                            From prompt to reel in 3 steps
                        </h2>
                        <p className="mt-3 text-[var(--color-text-secondary)]">
                            No editing skills required. Just describe what you want.
                        </p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {[
                            { icon: MessageSquare, title: 'Describe Your Reel', desc: 'Type a simple prompt like "Make a 30-second reel about solar energy in India" and AI writes an engaging narration script.', color: 'bg-purple-50 text-[var(--color-primary)]' },
                            { icon: Image, title: 'AI Generates Scenes', desc: 'Beautiful, cinematic images are generated for each scene. Edit prompts if you want, or let AI handle it all.', color: 'bg-blue-50 text-[var(--color-info)]' },
                            { icon: Video, title: 'Download Your MP4', desc: 'Voiceover, transitions, and Ken Burns effects are added automatically. Download your ready-to-post reel.', color: 'bg-green-50 text-[var(--color-success)]' },
                        ].map(({ icon: Icon, title, desc, color }, i) => (
                            <div key={i} className="card p-8 text-center">
                                <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mx-auto mb-5`}>
                                    <Icon size={24} />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">{title}</h3>
                                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-20 bg-[var(--color-bg-subtle)]">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)]">How it works</h2>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {[
                            { step: '1', icon: MessageSquare, title: 'Send a Prompt', desc: 'Describe your reel in natural language' },
                            { step: '2', icon: Sparkles, title: 'Review Script', desc: 'Edit or approve the AI-generated narration' },
                            { step: '3', icon: Image, title: 'Generate Scenes', desc: 'AI creates cinematic images for each scene' },
                            { step: '4', icon: Video, title: 'Get Your Reel', desc: 'Download the final MP4 with voiceover' },
                        ].map(({ step, icon: Icon, title, desc }, i) => (
                            <div key={i} className="text-center">
                                <div className="w-12 h-12 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-lg font-bold mx-auto mb-4">
                                    {step}
                                </div>
                                <h3 className="font-bold text-[var(--color-text)] mb-1">{title}</h3>
                                <p className="text-sm text-[var(--color-text-secondary)]">{desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing */}
            <section className="py-20 bg-white">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)]">Simple credit-based pricing</h2>
                        <p className="mt-3 text-[var(--color-text-secondary)]">
                            Pay only for what you create. No subscriptions.
                        </p>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-6">
                        {[
                            { name: 'Starter', credits: '200', price: 'Free', desc: 'Sign up bonus', highlight: false },
                            { name: 'Creator', credits: '500', price: '$9', desc: 'Best value', highlight: true },
                            { name: 'Pro', credits: '1500', price: '$19', desc: 'For power users', highlight: false },
                        ].map(({ name, credits, price, desc, highlight }, i) => (
                            <div key={i} className={`card p-8 text-center ${highlight ? 'border-[var(--color-primary)] border-2 shadow-lg shadow-[var(--color-primary)]/10' : ''}`}>
                                {highlight && (
                                    <span className="badge badge-primary mb-4">Most Popular</span>
                                )}
                                <h3 className="text-lg font-bold text-[var(--color-text)]">{name}</h3>
                                <div className="mt-4">
                                    <span className="text-4xl font-extrabold text-[var(--color-text)]">{price}</span>
                                </div>
                                <p className="mt-2 text-[var(--color-primary)] font-semibold">{credits} credits</p>
                                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{desc}</p>
                                <div className="mt-6 text-xs text-[var(--color-text-secondary)] space-y-1">
                                    <p>~{Math.floor(parseInt(credits) / 39)} reels (30s each)</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features grid */}
            <section className="py-20 bg-[var(--color-bg-subtle)]">
                <div className="max-w-5xl mx-auto px-6">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { icon: Zap, title: 'Lightning Fast', desc: 'Generate reels in under 2 minutes' },
                            { icon: Shield, title: 'No API Keys Needed', desc: 'Everything runs server-side. Just sign up and create.' },
                            { icon: Clock, title: 'Credits, Not Subscriptions', desc: 'Pay only when you create. No monthly fees.' },
                        ].map(({ icon: Icon, title, desc }, i) => (
                            <div key={i} className="flex gap-4 p-5">
                                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-100)] text-[var(--color-primary)] flex items-center justify-center shrink-0">
                                    <Icon size={20} />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-[var(--color-text)]">{title}</h3>
                                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className="py-20 hero-gradient">
                <div className="max-w-3xl mx-auto px-6 text-center">
                    <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-text)]">
                        Ready to create your first reel?
                    </h2>
                    <p className="mt-4 text-[var(--color-text-secondary)]">
                        Sign up free and get 200 credits to start creating amazing Instagram Reels.
                    </p>
                    <Link to="/signup" className="btn-primary text-lg px-8 py-3.5 rounded-xl mt-8 inline-flex shadow-lg shadow-[var(--color-primary)]/20">
                        Start Creating Free <ArrowRight size={18} />
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[var(--color-border)] py-8">
                <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Film size={18} className="text-[var(--color-primary)]" />
                        <span className="font-semibold text-[var(--color-text)]">Reely</span>
                    </div>
                    <p className="text-sm text-[var(--color-text-muted)]">
                        © {new Date().getFullYear()} Reely. AI-powered Instagram Reel creator.
                    </p>
                </div>
            </footer>
        </div>
    );
}
