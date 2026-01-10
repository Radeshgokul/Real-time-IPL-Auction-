import axios from 'axios';

const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const API_URL = isProduction
    ? 'https://real-time-ipl-auction.onrender.com/api'
    : `http://${window.location.hostname}:5000/api`;

const api = axios.create({
    baseURL: API_URL,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers['x-auth-token'] = token;
    }
    return config;
});

export const login = (email, password) => api.post('/auth/login', { email, password });
export const register = (username, email, password) => api.post('/auth/register', { username, email, password });
export const guestLogin = (username) => api.post('/auth/guest', { username });
export const createRoom = (maxTeams) => api.post('/rooms/create', { maxTeams });
export const joinRoom = (roomId) => api.post('/rooms/join', { roomId });

export default api;
