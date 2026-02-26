import { authenticate } from '../_lib/supabase.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await authenticate(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    try {
        const { data: profile, error: pErr } = await auth.supabaseUser
            .from('profiles')
            .select('credits, total_videos_created')
            .eq('id', auth.user.id)
            .single();

        if (pErr) throw pErr;

        const { data: transactions, error: tErr } = await auth.supabaseUser
            .from('credit_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (tErr) throw tErr;

        return res.json({
            credits: profile?.credits ?? 0,
            totalVideosCreated: profile?.total_videos_created ?? 0,
            transactions: transactions || [],
        });
    } catch (err) {
        console.error('[Credits Error]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
