import { useState } from 'react';
import { Play, Send } from 'lucide-react';
import { apiPost } from '../lib/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function Playground() {
    const [prompt, setPrompt] = useState('Make a motivational video about ancient Rome. 20 seconds long.');
    const [senderId, setSenderId] = useState('test_user_123');
    const navigate = useNavigate();

    async function handleSimulate(e) {
        e.preventDefault();
        try {
            await apiPost('/admin/playground/simulate', {
                text_content: prompt,
                sender_id: senderId
            });
            toast.success('Simulated IG DM Webhook trigger!');
            // Redirect to dashboard to watch it
            setTimeout(() => navigate('/'), 1000);
        } catch (err) {
            toast.error(err.message);
        }
    }

    return (
        <div className="p-8 max-w-3xl mx-auto w-full">
            <h1 className="text-2xl font-bold flex items-center gap-2 mb-6"><Play /> Playground</h1>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
                <h2 className="text-lg font-semibold mb-4 text-gray-800">Simulate Inbound DM</h2>
                <p className="text-sm text-gray-500 mb-6">Test the end-to-end pipeline by firing a fake webhook payload.</p>

                <form onSubmit={handleSimulate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sender IG ID</label>
                        <input
                            type="text"
                            value={senderId}
                            onChange={e => setSenderId(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">IG Message Text</label>
                        <textarea
                            rows="4"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button type="submit" className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 mt-4">
                        <Send size={18} /> Fire Webhook Payload
                    </button>
                </form>
            </div>
        </div>
    );
}
