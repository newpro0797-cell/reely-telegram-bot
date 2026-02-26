import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import SignUp from './pages/SignUp';
import SignIn from './pages/SignIn';
import Chat from './pages/Chat';

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* Public */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/signup" element={<SignUp />} />
                    <Route path="/signin" element={<SignIn />} />

                    {/* Protected */}
                    <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                            <Route path="/chat" element={<Chat />} />
                            <Route path="/chat/:sessionId" element={<Chat />} />
                        </Route>
                    </Route>
                </Routes>
            </BrowserRouter>
            <Toaster
                position="top-right"
                toastOptions={{
                    className: 'toast-override',
                    style: {
                        background: '#fff',
                        color: '#111827',
                        border: '1px solid #E5E7EB',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    },
                }}
            />
        </AuthProvider>
    );
}
