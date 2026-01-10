import React, { useState } from 'react';
import axios from '../utils/api';
import { motion } from 'framer-motion';

const AuthPage = ({ setUser }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const endpoint = isLogin ? '/auth/login' : '/auth/register';
            const { data } = await axios.post(endpoint, formData);
            localStorage.setItem('token', data.token);
            setUser(data.user);
        } catch (err) {
            setError(err.response?.data?.message || 'Authentication failed');
        }
    };

    const handleGuest = async () => {
        if (!formData.username) return setError('Username is required for Guest Login');
        try {
            const { data } = await axios.post('/auth/guest', { username: formData.username });
            localStorage.setItem('token', data.token);
            setUser(data.user);
        } catch (err) {
            setError(err.response?.data?.message || 'Guest login failed');
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-ipl-dark text-white p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-t-4 border-ipl-gold w-full max-w-md"
            >
                <h1 className="text-4xl font-black text-ipl-gold mb-8 italic text-center text-shadow-glow">
                    {isLogin ? 'WELCOME BACK' : 'JOIN THE LEAGUE'}
                </h1>

                {error && <div className="bg-red-500/20 border border-red-500 text-red-100 p-3 rounded mb-6 text-sm">{error}</div>}

                <form onSubmit={handleAuth} className="space-y-4">
                    {!isLogin && (
                        <input
                            type="text"
                            placeholder="Username"
                            className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg focus:border-ipl-gold outline-none transition-all"
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                            required
                        />
                    )}
                    <input
                        type="email"
                        placeholder="Email Address"
                        className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg focus:border-ipl-gold outline-none transition-all"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg focus:border-ipl-gold outline-none transition-all"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                    />

                    <button type="submit" className="w-full bg-ipl-gold text-black font-black py-4 rounded-lg hover:bg-yellow-400 transition-all uppercase tracking-widest">
                        {isLogin ? 'Login' : 'Sign Up'}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-700/50 flex flex-col items-center gap-4">
                    <div className="w-full">
                        <input
                            type="text"
                            placeholder="Username (for Guest)"
                            className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg focus:border-ipl-blue outline-none transition-all mb-2"
                            value={isLogin ? formData.username : ''}
                            onChange={(e) => isLogin && setFormData({ ...formData, username: e.target.value })}
                            disabled={!isLogin}
                        />
                        <button onClick={handleGuest} className="w-full bg-ipl-blue text-white font-bold py-4 rounded-lg hover:bg-blue-600 transition-all text-sm uppercase tracking-widest border border-blue-400/30">
                            Play as Guest
                        </button>
                    </div>

                    <button onClick={() => setIsLogin(!isLogin)} className="text-slate-400 hover:text-ipl-gold transition-all text-sm font-bold">
                        {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default AuthPage;
