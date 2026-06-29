import { Server } from 'socket.io';

let io: Server | null = null;
let currentStatus = 'initializing';
let currentQr = '';
const logs: any[] = [];

export function initSocket(serverIo: Server) {
  io = serverIo;
  
  io.on('connection', (socket) => {
    console.log('Client connected to socket');
    
    // Send current state
    socket.emit('status', { status: currentStatus });
    if (currentQr) socket.emit('qr', currentQr);
    
    // Send recent logs
    logs.forEach(log => socket.emit('log', log));
  });
}

export function getCurrentStatus() { return currentStatus; }
export function getCurrentQr() { return currentQr; }

export function getIo() {
  return io;
}

export function emitStatus(status: string, data?: any) {
  currentStatus = status;
  if (io) {
    io.emit('status', { status, data });
  }
}

export function emitLog(message: string, level: 'info' | 'error' | 'warn' = 'info') {
  const log = { message, level, timestamp: new Date().toISOString() };
  logs.push(log);
  if (logs.length > 100) logs.shift();
  
  if (io) {
    io.emit('log', log);
  }
}

export function emitQR(qr: string) {
  currentQr = qr;
  if (io) {
    io.emit('qr', qr);
  }
}
