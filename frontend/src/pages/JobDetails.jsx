import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiGet } from '../lib/api';
import { ArrowLeft, Clock, Activity, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

export default function JobDetails() {
    const { jobId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState({ job: null, events: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDetails();
        const interval = setInterval(fetchDetails, 5000);
        return () => clearInterval(interval);
    }, [jobId]);

    async function fetchDetails() {
        try {
            const res = await apiGet(`/admin/jobs/${jobId}`);
            setData(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    if (loading && !data.job) return <div className="p-8"><RefreshCw className="animate-spin" /></div>;
    if (!data.job) return <div className="p-8">Job not found.</div>;

    const { job, events } = data;

    return (
        <div className="p-8 max-w-4xl mx-auto w-full">
            <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-800 flex items-center gap-2 mb-6">
                <ArrowLeft size={16} /> Back to Dashboard
            </button>

            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">Job {job.id.substring(0, 8)}</h1>
                    <p className="text-gray-500 text-sm mt-1">Sender: {job.inbound_messages?.sender_id}</p>
                </div>
                <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${job.status === 'complete' ? 'bg-green-50 text-green-700 border-green-200' :
                        job.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                            'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                    {job.status === 'complete' ? <CheckCircle size={14} /> : job.status === 'failed' ? <AlertCircle size={14} /> : <RefreshCw size={14} className="animate-spin" />}
                    {job.status.toUpperCase()}
                </span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8 mt-4 grid grid-cols-2 gap-4">
                <div>
                    <span className="block text-xs text-gray-400 font-bold tracking-wider mb-1">PROMPT</span>
                    <p className="text-sm text-gray-800">{job.inbound_messages?.text_content || 'N/A'}</p>
                </div>
                <div>
                    <span className="block text-xs text-gray-400 font-bold tracking-wider mb-1">NARRATION</span>
                    <p className="text-sm text-gray-800 max-h-32 overflow-y-auto">{job.narration_text || 'Pending'}</p>
                </div>
                <div>
                    <span className="block text-xs text-gray-400 font-bold tracking-wider mb-1">AUDIO LENGTH</span>
                    <p className="text-sm text-gray-800">{job.audio_duration_seconds ? job.audio_duration_seconds.toFixed(2) + 's' : 'Pending'}</p>
                </div>
                <div>
                    <span className="block text-xs text-gray-400 font-bold tracking-wider mb-1">FINAL VIDEO</span>
                    {job.video_storage_url ? (
                        <a href={job.video_storage_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                            View/Download Video
                        </a>
                    ) : 'Pending'}
                </div>
            </div>

            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Activity size={18} /> Event Timeline</h2>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-gray-100">
                        {events.length === 0 ? (
                            <tr><td className="p-4 text-center text-gray-500">No events logged yet.</td></tr>
                        ) : (
                            events.map(ev => (
                                <tr key={ev.id}>
                                    <td className="p-4 w-40 text-gray-500 font-mono text-xs">{new Date(ev.created_at).toLocaleTimeString()}</td>
                                    <td className="p-4 font-medium text-gray-800">{ev.event_type}</td>
                                    <td className="p-4 text-gray-500 font-mono text-xs">
                                        {ev.details && Object.keys(ev.details).length > 0 ? JSON.stringify(ev.details) : ''}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {job.error_message && (
                <div className="mt-6 bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm font-mono whitespace-pre-wrap">
                    <span className="font-bold flex items-center gap-2 mb-2"><AlertCircle size={16} /> Error Stack</span>
                    {job.error_message}
                </div>
            )}
        </div>
    );
}
