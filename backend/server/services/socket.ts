import { Server } from 'socket.io';
import { EventEmitter } from 'events';

let io: Server | null = null;
let currentStatus = 'initializing';
let currentStatusData: any = null;
let currentTgStatus = 'disconnected';
let currentTgStatusData: any = null;
let currentQr = '';
let currentTgQr: { image: string, url: string } | null = null;
export const logs: any[] = [];
export const pendingApprovals: any[] = [];

export const backendEvents = new EventEmitter();

// Track basic stats in memory
export const systemStats = {
  activeSessions: 0,
  messagesProcessed: 0,
  aiLatency: 0,
};

export function initSocket(serverIo: Server) {
  io = serverIo;
  
  io.on('connection', (socket) => {
    console.log('Client connected to socket');
    
    // Send current state
    socket.emit('status', { status: currentStatus });
    socket.emit('bot_status', { status: currentStatus });
    socket.emit('tg_status', { status: currentTgStatus });
    if (currentQr) {
      socket.emit('qr', currentQr);
      socket.emit('qr_code', currentQr);
    }
    if (currentTgQr) socket.emit('tg_qr', currentTgQr);
    
    // Send recent logs mapping to frontend format
    logs.forEach(log => socket.emit('log_event', log));
    
    // Send stats
    socket.emit('stats_update', {
      activeSessions: systemStats.activeSessions.toString(),
      messagesProcessed: systemStats.messagesProcessed.toString(),
      aiLatency: systemStats.aiLatency ? `${systemStats.aiLatency}ms` : '0ms',
      pendingApprovals: pendingApprovals.length.toString()
    });

    // Send existing pending approvals
    pendingApprovals.forEach(msg => socket.emit('pending_approval', msg));

    // Handle dashboard approvals/rejections
    socket.on('approve_message', ({ id, customReply }) => {
      // Find the callback/resolver (handled in orchestrator)
      backendEvents.emit('approve', { id, customReply });
      const idx = pendingApprovals.findIndex(m => m.id === id);
      if (idx !== -1) {
        pendingApprovals.splice(idx, 1);
        emitStats();
        if (io) io.emit('message_resolved', id);
      }
    });

    socket.on('reject_message', ({ id }) => {
      backendEvents.emit('reject', { id });
      const idx = pendingApprovals.findIndex(m => m.id === id);
      if (idx !== -1) {
        pendingApprovals.splice(idx, 1);
        emitStats();
        if (io) io.emit('message_resolved', id);
      }
    });
  });
}

export function getCurrentStatus() { return currentStatus; }
export function getCurrentStatusData() { return currentStatusData; }
export function getCurrentTgStatus() { return currentTgStatus; }
export function getCurrentTgStatusData() { return currentTgStatusData; }
export function getCurrentQr() { return currentQr; }
export function getCurrentTgQr() { return currentTgQr; }

export function getIo() {
  return io;
}

export function emitStatus(status: string, data?: any) {
  currentStatus = status;
  currentStatusData = data;
  if (io) {
    io.emit('status', { status, data });
    io.emit('bot_status', { status, reason: data }); // For frontend compat
  }
}

export function emitTgStatus(status: string, data?: any) {
  currentTgStatus = status;
  currentTgStatusData = data;
  if (io) {
    io.emit('tg_status', { status, data });
  }
}

export function emitLog(message: string, level: 'info' | 'error' | 'warn' = 'info') {
  const time = new Date().toLocaleTimeString();
  const log = { msg: message, level, time }; // match frontend type
  logs.push(log);
  if (logs.length > 100) logs.shift();
  
  if (io) {
    io.emit('log_event', log);
    io.emit('log', { message, level, timestamp: new Date().toISOString() }); // Backwards compat
  }
}

export function emitQR(qr: string) {
  currentQr = qr;
  if (io) {
    io.emit('qr', qr);
    io.emit('qr_code', qr); // For frontend compat
  }
}

export function emitTgQR(qrImage: string, qrUrl: string) {
  const payload = { image: qrImage, url: qrUrl };
  currentTgQr = payload;
  if (io) {
    io.emit('tg_qr', payload);
  }
}

export function clearTgQR() {
  currentTgQr = null;
  if (io) {
    io.emit('tg_qr', null);
  }
}

// New AI Dashboard Events
export function emitAiInvocation(task: string, model: string, status: 'success' | 'error', latencyMs?: number) {
  const time = new Date().toLocaleTimeString();
  
  if (latencyMs) {
    systemStats.aiLatency = latencyMs;
    emitStats();
  }

  if (io) {
    io.emit('ai_invocation', { time, model, task, status });
  }
}

export function emitPendingApproval(message: any) {
  pendingApprovals.push(message);
  emitStats();
  if (io) {
    io.emit('pending_approval', message);
  }
}

export function emitMessageResolved(id: string) {
  const idx = pendingApprovals.findIndex(m => m.id === id);
  if (idx !== -1) pendingApprovals.splice(idx, 1);
  emitStats();
  if (io) {
    io.emit('message_resolved', id);
  }
}

export function incrementMessagesProcessed() {
  systemStats.messagesProcessed++;
  emitStats();
}

export function setSystemActiveSessions(count: number) {
  systemStats.activeSessions = count;
  emitStats();
}

function emitStats() {
  if (io) {
    io.emit('stats_update', {
      activeSessions: systemStats.activeSessions.toString(),
      messagesProcessed: systemStats.messagesProcessed.toString(),
      aiLatency: systemStats.aiLatency ? `${systemStats.aiLatency}ms` : '0ms',
      pendingApprovals: pendingApprovals.length.toString()
    });
  }
}
