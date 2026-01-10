import { io } from 'socket.io-client';

// Dynamically connect to the same host that served the page
const socket = io(`http://${window.location.hostname}:5000`);

export default socket;
