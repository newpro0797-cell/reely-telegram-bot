const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/credits — get user's credit balance + recent transactions
router.get('/', async (req, res, next) => {
    try {
        const { data: profile, error: profileError } = await req.supabaseUser
            .from('profiles')
            .select('credits, total_videos_created')
            .eq('id', req.user.id)
            .single();

        if (profileError) throw profileError;

        const { data: transactions, error: txError } = await req.supabaseUser
            .from('credit_transactions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (txError) throw txError;

        res.json({
            credits: profile?.credits ?? 0,
            totalVideosCreated: profile?.total_videos_created ?? 0,
            transactions: transactions || [],
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
