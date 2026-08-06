import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 
    (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
        ? 'https://real-time-ipl-auction.onrender.com'
        : `http://${window.location.hostname}:5000`);

const socket = io(SOCKET_URL);

export default socket;
