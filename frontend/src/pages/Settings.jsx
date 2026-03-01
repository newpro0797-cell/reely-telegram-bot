import { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { Settings as SettingsIcon, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
    const [settings, setSettings] = useState({
        default_duration_seconds: '15',
        max_duration_seconds: '45',
        concurrency_limits: '{"workers": 5}'
    });

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const data = await apiGet('/admin/settings');
            const map = {};
            data.forEach(s => map[s.key] = s.value);
            setSettings(prev => ({ ...prev, ...map }));
        } catch (err) {
            console.error(err);
        }
    }

    async function handleSave(e) {
        e.preventDefault();
        try {
            await apiPost('/admin/settings', settings);
            toast.success('Settings saved');
        } catch (err) {
            toast.error(err.message);
        }
    }

    return (
        <div className="p-8 max-w-3xl mx-auto w-full">
            <h1 className="text-2xl font-bold flex items-center gap-2 mb-6"><SettingsIcon /> System Settings</h1>

            <form onSubmit={handleSave} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Duration (Seconds)</label>
                    <input
                        type="number"
                        value={settings.default_duration_seconds}
                        onChange={e => setSettings({ ...settings, default_duration_seconds: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Used if the user prompt doesn't specify a duration.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Duration (Seconds)</label>
                    <input
                        type="number"
                        value={settings.max_duration_seconds}
                        onChange={e => setSettings({ ...settings, max_duration_seconds: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">Capped at 45s due to Telegram Video target limits.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Concurrency Config (JSON)</label>
                    <textarea
                        rows="3"
                        value={settings.concurrency_limits}
                        onChange={e => setSettings({ ...settings, concurrency_limits: e.target.value })}
                        className="w-full font-mono text-sm px-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <button type="submit" className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
                        <Save size={18} /> Save Changes
                    </button>
                </div>
            </form>
        </div>
    );
}
