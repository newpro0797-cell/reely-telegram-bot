import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
}

export async function apiGet(path) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api${path}`, { headers });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

export async function apiPost(path, body = {}) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
    }
    return res.json();
}

export async function apiDelete(path) {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api${path}`, {
        method: 'DELETE',
        headers,
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
    }
    return res.json();
}
