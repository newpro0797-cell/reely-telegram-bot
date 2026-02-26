const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { runPipeline } = require('../pipeline/index');
const { decrypt } = require('../utils/encryption');

router.use(authMiddleware);

// POST /api/pipeline/run — trigger the full pipeline
router.post('/run', async (req, res, next) => {
    try {
        const { workflowId, prompt } = req.body;
        if (!workflowId || !prompt) {
            return res.status(400).json({ error: 'workflowId and prompt are required' });
        }

        // Fetch workflow (RLS ensures ownership)
        const { data: workflow, error: wfError } = await req.supabaseUser
            .from('workflows')
            .select('*')
            .eq('id', workflowId)
            .single();

        if (wfError || !workflow) {
            return res.status(404).json({ error: 'Workflow not found' });
        }

        if (!workflow.is_active) {
            return res.status(400).json({ error: 'Workflow is inactive' });
        }

        // Decrypt the API key for pipeline use
        const geminiApiKey = decrypt(workflow.gemini_api_key_encrypted);
        if (!geminiApiKey) {
            return res.status(400).json({ error: 'Gemini API key not configured' });
        }

        // Create run record
        const { data: run, error: runError } = await req.supabaseUser
            .from('workflow_runs')
            .insert({
                workflow_id: workflowId,
                user_id: req.user.id,
                trigger_message: prompt,
                status: 'running',
                current_stage: 'script_generation',
                log_json: { stages: [] },
            })
            .select()
            .single();

        if (runError) throw runError;

        // Return run_id immediately for Realtime subscription
        res.json({ runId: run.id });

        // Run pipeline asynchronously (don't await)
        runPipeline({
            run,
            workflow: { ...workflow, gemini_api_key: geminiApiKey },
            userId: req.user.id,
            prompt,
            accessToken: req.accessToken,
        }).catch((err) => {
            console.error('[Pipeline Error]', run.id, err.message);
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/pipeline/workflows/:workflowId/runs — list runs for a workflow
router.get('/workflows/:workflowId/runs', async (req, res, next) => {
    try {
        const { data, error } = await req.supabaseUser
            .from('workflow_runs')
            .select('*')
            .eq('workflow_id', req.params.workflowId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
