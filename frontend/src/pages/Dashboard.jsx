import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../lib/api';
import { Activity, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Dashboard() {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 10000); // poll every 10s
        return () => clearInterval(interval);
    }, []);

    async function fetchJobs() {
        try {
            const data = await apiGet('/admin/jobs');
            setJobs(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleRetry(jobId) {
        try {
            await apiPost(`/admin/jobs/${jobId}/retry`);
            toast.success('Job queued for retry');
            fetchJobs();
        } catch (err) {
            toast.error(err.message);
        }
    }

    if (loading) return <div className="p-8"><RefreshCw className="animate-spin" /></div>;

    return (
        <div className="p-8 max-w-6xl mx-auto w-full">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2"><Activity /> Job Dashboard</h1>
                <button onClick={fetchJobs} className="btn-ghost flex items-center gap-2 text-sm"><RefreshCw size={16} /> Refresh</button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100 text-gray-600">
                        <tr>
                            <th className="p-4 font-medium">Job ID</th>
                            <th className="p-4 font-medium">Sender</th>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium">Duration Target</th>
                            <th className="p-4 font-medium">Created At</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {jobs.map(job => (
                            <tr key={job.id} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => navigate(`/job/${job.id}`)}>
                                <td className="p-4 font-mono text-xs text-blue-600">{job.id.substring(0, 8)}...</td>
                                <td className="p-4 font-medium">{job.inbound_messages?.sender_id || 'Unknown'}</td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${job.status === 'complete' ? 'bg-green-50 text-green-700 border-green-200' :
                                            job.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}>
                                        {job.status === 'complete' && <CheckCircle size={12} />}
                                        {job.status === 'failed' && <AlertCircle size={12} />}
                                        {job.status.includes('generating') || job.status === 'stitching' ? <RefreshCw size={12} className="animate-spin" /> :
                                            (job.status !== 'complete' && job.status !== 'failed' && <Clock size={12} />)}
                                        {job.status.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500">{job.target_duration_seconds}s</td>
                                <td className="p-4 text-gray-500">{new Date(job.created_at).toLocaleString()}</td>
                                <td className="p-4 text-right">
                                    {job.status === 'failed' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRetry(job.id); }}
                                            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-md transition-colors"
                                        >
                                            Retry
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {jobs.length === 0 && (
                            <tr><td colSpan="6" className="p-8 text-center text-gray-500">No jobs found in the system.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
