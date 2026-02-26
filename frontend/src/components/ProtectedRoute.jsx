import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 size={28} className="text-[var(--color-primary)] animate-spin-slow" />
            </div>
        );
    }

    return user ? <Outlet /> : <Navigate to="/signin" replace />;
}
