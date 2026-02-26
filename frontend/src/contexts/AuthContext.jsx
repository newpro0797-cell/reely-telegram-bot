import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [credits, setCredits] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            const u = session?.user ?? null;
            setUser(u);
            if (u) fetchProfile(u.id);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const u = session?.user ?? null;
            setUser(u);
            if (u) fetchProfile(u.id);
            else { setCredits(null); }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function fetchProfile(userId) {
        if (!userId) return;
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('credits, total_videos_created')
                .eq('id', userId)
                .maybeSingle();

            if (data && !error) {
                setCredits(data.credits);
            }
        } catch (e) {
            // Expected to fail when not authenticated — ignore silently
        }
    }

    const refreshProfile = useCallback(async () => {
        if (user) await fetchProfile(user.id);
    }, [user]);

    async function signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
    }

    async function signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }

    async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        setUser(null);
        setCredits(null);
    }

    return (
        <AuthContext.Provider value={{ user, credits, loading, signUp, signIn, signOut, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
