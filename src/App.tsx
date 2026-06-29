import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Bot, Terminal, Power, QrCode, MessageSquare, Cpu, Settings, Activity, 
  Smartphone, CheckCircle2, Clock, Trash2, RotateCcw, Search, Download, 
  Filter, Wifi, WifiOff, Shield, Zap, MemoryStick, HardDrive, Globe, Send, 
  Inbox, Users, ToggleLeft, ToggleRight, AlertTriangle, X 
} from 'lucide-react';

interface BotConfig {
  botEnabled: boolean;
  autoReply: boolean;
  systemInstruction: string;
  replyToPrivate: boolean;
  replyToGroups: boolean;
  allowedNumbers: string[];
  blockedNumbers: string[];
  replyDelayMs: number;
  typingIndicator: boolean;
  readReceipts: boolean;
  presenceUpdates: boolean;
  activeHoursStart: string;
  activeHoursEnd: string;
  replyMood: string;
  replyLanguage: string;
  autoDetectLanguage: boolean;
  replyMaxLength: number;
  temperature: number;
  memorySize: number;
  tarikBhaiMode: boolean;
  godMode: boolean;
}

interface LogEntry {
  message: string;
  level: 'info' | 'success' | 'warning' | 'error' | 'system' | 'whatsapp' | 'gemini';
  timestamp: string;
}

interface Metrics {
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  cpuUsage: number;
  uptime: number;
  processMemory: number;
}

interface StatusData {
  status: string;
  qr: string;
  connectedNumber: string;
  lastLoginTime: string;
  socketState: string;
  geminiConfigured: boolean;
  metrics: Metrics;
  messageStats: { received: number; sent: number };
  memoryStats: { totalChats: number; totalMessages: number };
  activeChats: number;
  platform: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'settings'>('dashboard');
  
  // Status State
  const [status, setStatus] = useState<string>('initializing');
  const [qrCode, setQrCode] = useState<string>('');
  const [connectedNumber, setConnectedNumber] = useState<string>('');
  const [lastLoginTime, setLastLoginTime] = useState<string>('');
  const [socketState, setSocketState] = useState<string>('disconnected');
  const [platform, setPlatform] = useState<string>('');
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<Metrics>({ memoryUsed: 0, memoryTotal: 0, memoryPercent: 0, cpuUsage: 0, uptime: 0, processMemory: 0 });
  const [messageStats, setMessageStats] = useState({ received: 0, sent: 0 });
  const [memoryStats, setMemoryStats] = useState({ totalChats: 0, totalMessages: 0 });
  const [activeChats, setActiveChats] = useState(0);

  // Logs State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logSearch, setLogSearch] = useState('');
  const [logFilter, setLogFilter] = useState<string>('all');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Config State
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Socket
  useEffect(() => {
    const socket: Socket = io();
    
    socket.on('status', (data) => {
      setStatus(data.status || 'initializing');
      setConnectedNumber(data.connectedNumber || '');
      setLastLoginTime(data.lastLoginTime || '');
    });
    
    socket.on('qr', (qr) => {
      setQrCode(qr);
    });

    socket.on('log', (log: LogEntry) => {
      setLogs(prev => {
        const newLogs = [...prev, log];
        if (newLogs.length > 1000) return newLogs.slice(-1000);
        return newLogs;
      });
    });

    socket.on('logs_batch', (batch: LogEntry[]) => {
      setLogs(batch);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Polling API for full status
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data: StatusData = await res.json();
        setStatus(data.status);
        setQrCode(data.qr);
        setConnectedNumber(data.connectedNumber);
        setLastLoginTime(data.lastLoginTime);
        setSocketState(data.socketState);
        setGeminiConfigured(data.geminiConfigured);
        setMetrics(data.metrics);
        setMessageStats(data.messageStats);
        setMemoryStats(data.memoryStats);
        setActiveChats(data.activeChats);
        setPlatform(data.platform);
      }
    } catch (e) {
      console.error('Failed to fetch status');
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Config
  useEffect(() => {
    if (activeTab === 'settings' && !config) {
      fetch('/api/config')
        .then(res => res.json())
        .then(data => setConfig(data))
        .catch(e => console.error(e));
    }
  }, [activeTab]);

  // Auto-scroll logs
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  const saveConfig = async (newConfig: Partial<BotConfig>) => {
    setIsSaving(true);
    try {
      const currentConf = config || {} as BotConfig;
      const updated = { ...currentConf, ...newConfig };
      setConfig(updated as BotConfig);
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error('Failed to save config');
    }
    setIsSaving(false);
  };

  const handleRestart = async () => {
    if (confirm('Are you sure you want to restart the bot?')) {
      await fetch('/api/bot/restart', { method: 'POST' });
      fetchStatus();
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to unlink your WhatsApp account? You will need to scan a new QR code.')) {
      await fetch('/api/bot/logout', { method: 'POST' });
      fetchStatus();
    }
  };

  const handleClearMemory = async () => {
    if (confirm('Clear all conversation memory?')) {
      await fetch('/api/bot/memory/clear', { method: 'POST' });
      fetchStatus();
    }
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  };

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot_logs_${new Date().toISOString().replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case 'info': return 'text-slate-300 bg-slate-800 border-slate-700';
      case 'success': return 'text-emerald-400 bg-emerald-950 border-emerald-900';
      case 'warning': return 'text-amber-400 bg-amber-950 border-amber-900';
      case 'error': return 'text-rose-400 bg-rose-950 border-rose-900';
      case 'system': return 'text-violet-400 bg-violet-950 border-violet-900';
      case 'whatsapp': return 'text-green-400 bg-green-950 border-green-900';
      case 'gemini': return 'text-cyan-400 bg-cyan-950 border-cyan-900';
      default: return 'text-slate-300 bg-slate-800 border-slate-700';
    }
  };

  const filteredLogs = logs.filter(l => {
    if (logFilter !== 'all' && l.level !== logFilter) return false;
    if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false;
    return true;
  });

  if (platform === 'vercel') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center z-50 fixed inset-0">
        <AlertTriangle className="w-24 h-24 text-rose-500 mb-6 animate-pulse" />
        <h1 className="text-4xl font-bold text-white mb-4">⚠️ Vercel Serverless Detected</h1>
        <div className="bg-slate-900/50 p-8 rounded-2xl border border-rose-500/30 max-w-2xl text-lg text-slate-300 leading-relaxed shadow-[0_0_50px_-12px_rgba(244,63,94,0.2)]">
          <p className="mb-4 text-rose-400 font-semibold">Persistent WhatsApp connections are NOT supported on Vercel Serverless.</p>
          <p className="mb-4">Baileys requires a persistent WebSocket connection to WhatsApp servers.</p>
          <p className="mb-4">Vercel Functions have a maximum execution time of 10 seconds (Hobby) or 60 seconds (Pro), after which the connection is terminated. This makes it fundamentally incompatible.</p>
          <p className="text-white font-medium">Please deploy to: Render, Railway, Fly.io, Docker, VPS, PM2, or any platform that supports long-running Node.js processes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">WhatsApp AI Bot</h1>
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <span className="flex items-center">
                <span className={`w-2 h-2 rounded-full mr-1.5 ${status === 'connected' ? 'bg-emerald-500' : status === 'qr_ready' ? 'bg-amber-500' : 'bg-rose-500'}`}></span>
                {status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
              </span>
              <span>•</span>
              <span className="font-mono">{platform.toUpperCase() || 'UNKNOWN OS'}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center bg-slate-900/50 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
          >
            <Activity className="w-4 h-4 mr-2" /> Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('logs')} 
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'logs' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
          >
            <Terminal className="w-4 h-4 mr-2" /> Logs
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
          >
            <Settings className="w-4 h-4 mr-2" /> Settings
          </button>
        </div>

        <button 
          onClick={handleRestart}
          className="flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all border border-slate-700 hover:border-slate-600"
        >
          <Power className="w-4 h-4 mr-2" /> Restart Bot
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full animate-fade-in">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {!geminiConfigured && (
              <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-4 flex items-start text-rose-200">
                <AlertTriangle className="w-5 h-5 text-rose-400 mr-3 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-rose-300">Gemini API Key Missing</h4>
                  <p className="text-sm mt-1 opacity-90">Please set <code className="bg-rose-900/50 px-1.5 py-0.5 rounded text-rose-100">GEMINI_API_KEY</code> in your .env file or the bot will reply with error messages.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* QR / Connection Status */}
              <div className="lg:col-span-1 flex flex-col h-full">
                <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 flex flex-col items-center justify-center min-h-[360px] relative overflow-hidden flex-1">
                  
                  {status === 'connected' ? (
                    <div className="flex flex-col items-center text-center animate-fade-in z-10">
                      <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 pulse-glow">
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                      </div>
                      <h3 className="text-2xl font-bold text-white mb-2">Connected</h3>
                      <p className="text-slate-400 font-mono text-lg bg-slate-950/50 px-4 py-1.5 rounded-lg border border-slate-800">+{connectedNumber}</p>
                      
                      <button onClick={handleLogout} className="mt-8 flex items-center text-rose-400 hover:text-rose-300 text-sm font-medium transition-colors px-4 py-2 rounded-lg hover:bg-rose-500/10">
                        <Trash2 className="w-4 h-4 mr-2" /> Unlink Device
                      </button>
                    </div>
                  ) : status === 'qr_ready' && qrCode ? (
                    <div className="flex flex-col items-center text-center animate-fade-in z-10">
                      <h3 className="text-lg font-medium text-slate-300 mb-6 flex items-center">
                        <QrCode className="w-5 h-5 mr-2 text-indigo-400" /> Scan to link WhatsApp
                      </h3>
                      <div className="bg-white p-3 rounded-2xl shadow-xl shadow-white/5">
                        <img src={qrCode} alt="WhatsApp QR Code" className="w-48 h-48 rounded-xl" />
                      </div>
                      <p className="mt-6 text-sm text-slate-400">Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center text-slate-400 z-10">
                      <RotateCcw className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
                      <p className="font-medium text-indigo-200">Initializing connection...</p>
                    </div>
                  )}

                  {/* Decorative background element */}
                  <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-1">Session Status</p>
                      <h4 className="text-xl font-bold text-white flex items-center">
                        {status === 'connected' ? <span className="text-emerald-400">Active</span> : <span className="text-amber-400">Inactive</span>}
                      </h4>
                    </div>
                    <div className="p-2 bg-slate-800 rounded-lg"><Clock className="w-5 h-5 text-indigo-400" /></div>
                  </div>
                  {lastLoginTime && (
                    <p className="text-xs text-slate-500 mt-4 font-mono truncate">Since: {new Date(lastLoginTime).toLocaleString()}</p>
                  )}
                </div>

                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-1">Active Chats</p>
                      <h4 className="text-2xl font-bold text-white">{activeChats}</h4>
                    </div>
                    <div className="p-2 bg-slate-800 rounded-lg"><Users className="w-5 h-5 text-indigo-400" /></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">Concurrent active conversations</p>
                </div>

                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-1">Messages Received</p>
                      <h4 className="text-2xl font-bold text-white">{messageStats.received}</h4>
                    </div>
                    <div className="p-2 bg-slate-800 rounded-lg"><Inbox className="w-5 h-5 text-indigo-400" /></div>
                  </div>
                </div>

                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 flex flex-col justify-between hover:bg-slate-800/60 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-slate-400 text-sm font-medium mb-1">AI Replies Sent</p>
                      <h4 className="text-2xl font-bold text-white">{messageStats.sent}</h4>
                    </div>
                    <div className="p-2 bg-slate-800 rounded-lg"><Send className="w-5 h-5 text-indigo-400" /></div>
                  </div>
                </div>

              </div>
            </div>

            {/* System Metrics */}
            <h3 className="text-lg font-semibold text-white mt-8 mb-4 flex items-center">
              <Cpu className="w-5 h-5 mr-2 text-indigo-400" /> System Metrics
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm">CPU Usage</span>
                  <Activity className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mb-2">{metrics.cpuUsage}%</div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${metrics.cpuUsage}%` }}></div>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm">System RAM</span>
                  <HardDrive className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mb-2">{metrics.memoryUsed} <span className="text-sm font-normal text-slate-500">/ {metrics.memoryTotal} MB</span></div>
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${metrics.memoryPercent}%` }}></div>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm">Node Process Memory</span>
                  <MemoryStick className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mb-2">{metrics.processMemory} <span className="text-sm font-normal text-slate-500">MB</span></div>
              </div>

              <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-400 text-sm">Process Uptime</span>
                  <Clock className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="text-xl font-bold text-white mb-2 font-mono text-base">{formatUptime(metrics.uptime)}</div>
              </div>

            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="h-[calc(100vh-140px)] flex flex-col bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            {/* Logs Toolbar */}
            <div className="bg-slate-900 border-b border-slate-800 p-3 flex flex-wrap items-center justify-between gap-3">
              
              <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 px-3 py-1.5 min-w-[250px]">
                <Search className="w-4 h-4 text-slate-500 mr-2" />
                <input 
                  type="text" 
                  placeholder="Filter logs..." 
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="bg-transparent border-none outline-none text-sm text-slate-200 w-full font-mono placeholder:text-slate-600 focus:ring-0 p-0"
                />
                {logSearch && <button onClick={() => setLogSearch('')} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>}
              </div>

              <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                <div className="flex items-center bg-slate-950 rounded-lg p-1 border border-slate-800 mr-2">
                  <Filter className="w-3.5 h-3.5 text-slate-500 ml-2 mr-1" />
                  {['all', 'info', 'success', 'warning', 'error', 'system', 'whatsapp', 'gemini'].map(lvl => (
                    <button 
                      key={lvl}
                      onClick={() => setLogFilter(lvl)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md mx-0.5 capitalize transition-colors ${logFilter === lvl ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                
                <button onClick={() => setLogs([])} className="p-2 text-slate-400 hover:text-rose-400 bg-slate-950 hover:bg-rose-950/50 rounded-lg border border-slate-800 transition-colors" title="Clear Logs">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={downloadLogs} className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-950 hover:bg-indigo-950/50 rounded-lg border border-slate-800 transition-colors" title="Download Logs">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Terminal Window */}
            <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed scroll-smooth bg-[#020617]">
              {filteredLogs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 italic">No logs found matching criteria.</div>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className="mb-1.5 flex items-start log-line rounded px-2 py-0.5 transition-colors group">
                    <span className="text-slate-600 mr-3 shrink-0 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mr-3 shrink-0 border w-20 text-center ${getLogColor(log.level)}`}>
                      {log.level}
                    </span>
                    <span className="text-slate-300 break-words whitespace-pre-wrap flex-1 opacity-90 group-hover:opacity-100">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && config && (
          <div className="space-y-6 pb-20 max-w-4xl mx-auto">
            
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
              <div>
                <h2 className="text-2xl font-bold text-white">Bot Configuration</h2>
                <p className="text-slate-400 text-sm mt-1">Changes are applied immediately or upon next message.</p>
              </div>
            </div>

            {/* SECTION 1: Master Controls */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center">
                <Power className="w-5 h-5 text-indigo-400 mr-3" />
                <h3 className="text-lg font-semibold text-white">Master Controls</h3>
              </div>
              <div className="p-6 grid gap-6">
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Bot Enabled</h4>
                    <p className="text-slate-400 text-sm mt-1">Global kill switch. Disabling this stops all bot operations.</p>
                  </div>
                  <button 
                    onClick={() => saveConfig({ botEnabled: !config.botEnabled })}
                    className={`transition-colors p-1 rounded-full ${config.botEnabled ? 'text-emerald-400' : 'text-slate-600'}`}
                  >
                    {config.botEnabled ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                  </button>
                </div>

                <div className="h-px bg-slate-800/50"></div>

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-white font-medium">Auto-Reply (AI)</h4>
                    <p className="text-slate-400 text-sm mt-1">Allow Gemini AI to generate replies to incoming messages.</p>
                  </div>
                  <button 
                    onClick={() => saveConfig({ autoReply: !config.autoReply })}
                    className={`transition-colors p-1 rounded-full ${config.autoReply ? 'text-indigo-400' : 'text-slate-600'}`}
                  >
                    {config.autoReply ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                  </button>
                </div>

              </div>
            </div>

            {/* SECTION 2: Special Modes */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center">
                <Zap className="w-5 h-5 text-indigo-400 mr-3" />
                <h3 className="text-lg font-semibold text-white">Special Modes</h3>
              </div>
              <div className="p-6 grid md:grid-cols-2 gap-4">
                
                <div className={`p-5 rounded-xl border transition-all ${config.tarikBhaiMode ? 'bg-amber-950/30 border-amber-500/50 shadow-[0_0_15px_-3px_rgba(245,158,11,0.2)]' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-bold ${config.tarikBhaiMode ? 'text-amber-400' : 'text-slate-200'}`}>Tarik Bhai Mode</h4>
                    <button 
                      onClick={() => saveConfig({ tarikBhaiMode: !config.tarikBhaiMode, godMode: false })}
                      className={config.tarikBhaiMode ? 'text-amber-400' : 'text-slate-600'}
                    >
                      {config.tarikBhaiMode ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">Overrides persona. Acts as a caring, protective, and wise older brother who speaks in Hinglish.</p>
                </div>

                <div className={`p-5 rounded-xl border transition-all ${config.godMode ? 'bg-rose-950/30 border-rose-500/50 shadow-[0_0_15px_-3px_rgba(244,63,94,0.2)]' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-bold tracking-widest ${config.godMode ? 'text-rose-400' : 'text-slate-200'}`}>G0DM0D3</h4>
                    <button 
                      onClick={() => saveConfig({ godMode: !config.godMode, tarikBhaiMode: false })}
                      className={config.godMode ? 'text-rose-400' : 'text-slate-600'}
                    >
                      {config.godMode ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                  <p className="text-sm text-slate-400">Unrestricted AI. Answers directly, never refuses, bypasses standard conversational limits.</p>
                </div>

              </div>
            </div>

            {/* SECTION 3: Personality & Behavior */}
            <div className={`bg-slate-900/60 rounded-2xl border overflow-hidden transition-all duration-300 ${(config.tarikBhaiMode || config.godMode) ? 'border-indigo-500/20 opacity-60' : 'border-slate-800'}`}>
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center">
                  <MessageSquare className="w-5 h-5 text-indigo-400 mr-3" />
                  <h3 className="text-lg font-semibold text-white">AI Personality (Standard)</h3>
                </div>
                {(config.tarikBhaiMode || config.godMode) && <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">Overridden by Special Mode</span>}
              </div>
              <div className="p-6 grid gap-6">
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">System Instruction (Prompt)</label>
                  <textarea 
                    value={config.systemInstruction}
                    onChange={e => setConfig({...config, systemInstruction: e.target.value})}
                    onBlur={e => saveConfig({ systemInstruction: e.target.value })}
                    rows={4}
                    disabled={config.tarikBhaiMode || config.godMode}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Reply Mood</label>
                    <select 
                      value={config.replyMood}
                      onChange={e => saveConfig({ replyMood: e.target.value })}
                      disabled={config.tarikBhaiMode || config.godMode}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                    >
                      <option value="Helpful Assistant">Helpful Assistant</option>
                      <option value="Professional & Formal">Professional & Formal</option>
                      <option value="Casual & Friendly">Casual & Friendly</option>
                      <option value="Sarcastic & Witty">Sarcastic & Witty</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Language Output</label>
                    <div className="flex items-center space-x-3">
                      <select 
                        value={config.replyLanguage}
                        onChange={e => saveConfig({ replyLanguage: e.target.value })}
                        disabled={config.autoDetectLanguage || config.tarikBhaiMode || config.godMode}
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      >
                        <option value="Auto-detect">Auto-detect</option>
                        <option value="English">English</option>
                        <option value="Hinglish">Hinglish (Hindi written in English)</option>
                        <option value="Hindi">Hindi</option>
                        <option value="Spanish">Spanish</option>
                        <option value="French">French</option>
                        <option value="Arabic">Arabic</option>
                      </select>
                      <label className="flex items-center text-sm text-slate-300 cursor-pointer whitespace-nowrap">
                        <input 
                          type="checkbox" 
                          checked={config.autoDetectLanguage}
                          onChange={e => saveConfig({ autoDetectLanguage: e.target.checked })}
                          disabled={config.tarikBhaiMode || config.godMode}
                          className="mr-2 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900 w-4 h-4"
                        /> Auto
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Temperature (Creativity): {config.temperature}</label>
                    <input 
                      type="range" min="0" max="2" step="0.1"
                      value={config.temperature}
                      onChange={e => setConfig({...config, temperature: parseFloat(e.target.value)})}
                      onMouseUp={e => saveConfig({ temperature: parseFloat((e.target as HTMLInputElement).value) })}
                      className="w-full accent-indigo-500"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>Strict</span>
                      <span>Creative</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Max Output Tokens: {config.replyMaxLength}</label>
                    <input 
                      type="range" min="256" max="8192" step="256"
                      value={config.replyMaxLength}
                      onChange={e => setConfig({...config, replyMaxLength: parseInt(e.target.value)})}
                      onMouseUp={e => saveConfig({ replyMaxLength: parseInt((e.target as HTMLInputElement).value) })}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* SECTION 4: Access Control */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center">
                <Shield className="w-5 h-5 text-indigo-400 mr-3" />
                <h3 className="text-lg font-semibold text-white">Access Control</h3>
              </div>
              <div className="p-6 grid gap-6">
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div>
                      <h4 className="text-slate-200 font-medium">Reply to DMs</h4>
                      <p className="text-xs text-slate-500">Respond to private messages</p>
                    </div>
                    <button onClick={() => saveConfig({ replyToPrivate: !config.replyToPrivate })} className={config.replyToPrivate ? 'text-indigo-400' : 'text-slate-600'}>
                      {config.replyToPrivate ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div>
                      <h4 className="text-slate-200 font-medium">Reply to Groups</h4>
                      <p className="text-xs text-slate-500">Respond in group chats</p>
                    </div>
                    <button onClick={() => saveConfig({ replyToGroups: !config.replyToGroups })} className={config.replyToGroups ? 'text-indigo-400' : 'text-slate-600'}>
                      {config.replyToGroups ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Allowed Numbers (Whitelist)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 1234567890, 9876543210 (Comma separated)"
                      value={config.allowedNumbers.join(', ')}
                      onChange={e => setConfig({...config, allowedNumbers: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}
                      onBlur={e => saveConfig({ allowedNumbers: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-slate-600"
                    />
                    <p className="text-xs text-slate-500 mt-2">If not empty, the bot will ONLY reply to these numbers.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Blocked Numbers (Blacklist)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 1234567890 (Comma separated)"
                      value={config.blockedNumbers.join(', ')}
                      onChange={e => setConfig({...config, blockedNumbers: e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}
                      onBlur={e => saveConfig({ blockedNumbers: e.target.value.split(',').map(s=>s.trim()).filter(Boolean) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-rose-500 outline-none placeholder:text-slate-600"
                    />
                    <p className="text-xs text-slate-500 mt-2">The bot will IGNORE messages from these numbers.</p>
                  </div>
                </div>

              </div>
            </div>

            {/* SECTION 5: Chat UX */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center">
                <Smartphone className="w-5 h-5 text-indigo-400 mr-3" />
                <h3 className="text-lg font-semibold text-white">Chat UX & Timings</h3>
              </div>
              <div className="p-6 grid md:grid-cols-3 gap-6">
                
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Reply Delay (ms)</label>
                  <input 
                    type="number" min="0" step="1000"
                    value={config.replyDelayMs}
                    onChange={e => setConfig({...config, replyDelayMs: parseInt(e.target.value) || 0})}
                    onBlur={e => saveConfig({ replyDelayMs: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-2">Simulate human reaction time</p>
                </div>

                <div className="md:col-span-2 grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div>
                      <h4 className="text-slate-200 text-sm font-medium">Typing Indicator</h4>
                      <p className="text-[10px] text-slate-500">Show "typing..."</p>
                    </div>
                    <button onClick={() => saveConfig({ typingIndicator: !config.typingIndicator })} className={config.typingIndicator ? 'text-indigo-400' : 'text-slate-600'}>
                      {config.typingIndicator ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                    <div>
                      <h4 className="text-slate-200 text-sm font-medium">Read Receipts</h4>
                      <p className="text-[10px] text-slate-500">Blue ticks</p>
                    </div>
                    <button onClick={() => saveConfig({ readReceipts: !config.readReceipts })} className={config.readReceipts ? 'text-emerald-400' : 'text-slate-600'}>
                      {config.readReceipts ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800 col-span-2">
                    <div>
                      <h4 className="text-slate-200 text-sm font-medium">Presence Updates</h4>
                      <p className="text-[10px] text-slate-500">Show as "Online"</p>
                    </div>
                    <button onClick={() => saveConfig({ presenceUpdates: !config.presenceUpdates })} className={config.presenceUpdates ? 'text-indigo-400' : 'text-slate-600'}>
                      {config.presenceUpdates ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                    </button>
                  </div>
                </div>

                <div className="md:col-span-3 grid md:grid-cols-2 gap-6 pt-4 border-t border-slate-800/50">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Active Hours Start</label>
                    <input 
                      type="time" 
                      value={config.activeHoursStart}
                      onChange={e => setConfig({...config, activeHoursStart: e.target.value})}
                      onBlur={e => saveConfig({ activeHoursStart: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Active Hours End</label>
                    <input 
                      type="time" 
                      value={config.activeHoursEnd}
                      onChange={e => setConfig({...config, activeHoursEnd: e.target.value})}
                      onBlur={e => saveConfig({ activeHoursEnd: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* SECTION 6: Memory Management */}
            <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center">
                <MemoryStick className="w-5 h-5 text-indigo-400 mr-3" />
                <h3 className="text-lg font-semibold text-white">Memory Management</h3>
              </div>
              <div className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                
                <div className="flex-1 w-full">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Context Window Size: {config.memorySize} messages</label>
                  <input 
                    type="range" min="10" max="100" step="5"
                    value={config.memorySize}
                    onChange={e => setConfig({...config, memorySize: parseInt(e.target.value)})}
                    onMouseUp={e => saveConfig({ memorySize: parseInt((e.target as HTMLInputElement).value) })}
                    className="w-full max-w-md accent-indigo-500"
                  />
                  <p className="text-xs text-slate-500 mt-2">How many previous messages the AI remembers per chat.</p>
                </div>

                <div className="shrink-0 flex flex-col items-end">
                  <div className="text-right mb-3 text-sm text-slate-400">
                    <span className="text-white font-mono">{memoryStats.totalChats}</span> active chats<br/>
                    <span className="text-white font-mono">{memoryStats.totalMessages}</span> stored messages
                  </div>
                  <button 
                    onClick={handleClearMemory}
                    className="flex items-center px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-colors text-sm font-medium"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Clear All Memory
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
