import { Server } from 'socket.io';
import os from 'os';

let io: Server | null = null;
let currentStatus = 'initializing';
let currentQr = '';
let connectedNumber = '';
let lastLoginTime = '';
const logs: LogEntry[] = [];
const startTime = Date.now();

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'system' | 'whatsapp' | 'gemini';

export interface LogEntry {
  message: string;
  level: LogLevel;
  timestamp: string;
}

export function initSocket(serverIo: Server) {
  io = serverIo;
  io.on('connection', (socket) => {
    socket.emit('status', { status: currentStatus, connectedNumber, lastLoginTime });
    if (currentQr) socket.emit('qr', currentQr);
    socket.emit('logs_batch', logs.slice(-200));
  });
}

export function getIo() { return io; }
export function getCurrentStatus() { return currentStatus; }
export function getCurrentQr() { return currentQr; }
export function getConnectedNumber() { return connectedNumber; }
export function getLastLoginTime() { return lastLoginTime; }
export function getLogs() { return logs; }

export function setConnectedNumber(num: string) { connectedNumber = num; }
export function setLastLoginTime(time: string) { lastLoginTime = time; }

export function emitStatus(status: string, data?: any) {
  currentStatus = status;
  if (io) io.emit('status', { status, connectedNumber, lastLoginTime, ...data });
}

export function emitLog(message: string, level: LogLevel = 'info') {
  const log: LogEntry = { message, level, timestamp: new Date().toISOString() };
  logs.push(log);
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  if (io) io.emit('log', log);
}

export function emitQR(qr: string) {
  currentQr = qr;
  if (io) io.emit('qr', qr);
}

export function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const cpus = os.cpus();
  let cpuIdle = 0, cpuTotal = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      cpuTotal += cpu.times[type];
    }
    cpuIdle += cpu.times.idle;
  }
  const cpuUsage = Math.round(((cpuTotal - cpuIdle) / cpuTotal) * 100);
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  return {
    memoryUsed: Math.round(usedMem / 1024 / 1024),
    memoryTotal: Math.round(totalMem / 1024 / 1024),
    memoryPercent: Math.round((usedMem / totalMem) * 100),
    cpuUsage,
    uptime,
    processMemory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };
}
