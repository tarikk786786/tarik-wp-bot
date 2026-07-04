"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, MessageCircle, Brain, Users, Zap, Search, Terminal, Loader2 } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { motion, AnimatePresence, Variants } from "framer-motion";

type LogEvent = { level: "info" | "warn" | "error"; msg: string; time: string };
type AIInvocation = { time: string; model: string; task: string; status: string };

const FADE_IN: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const STAGGER: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

export default function Dashboard() {
  const { socket, isConnected } = useSocket();
  const [logs, setLogs] = useState<LogEvent[]>([
    { level: "info", msg: "Dashboard initialized.", time: new Date().toLocaleTimeString() }
  ]);
  const [invocations, setInvocations] = useState<AIInvocation[]>([]);
  const [stats, setStats] = useState({
    activeSessions: "0",
    messagesProcessed: "0",
    aiLatency: "0ms",
    pendingApprovals: "0"
  });
  const [botStatus, setBotStatus] = useState<string>("initializing");
  const [qrCode, setQrCode] = useState<string>("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    socket.on("log_event", (log: LogEvent) => {
      setLogs((prev) => [...prev, log].slice(-50)); // Keep last 50 logs, append to bottom
    });

    socket.on("ai_invocation", (invoc: AIInvocation) => {
      setInvocations((prev) => [invoc, ...prev].slice(0, 10)); // Keep last 10
    });

    socket.on("stats_update", (newStats) => {
      setStats((prev) => ({ ...prev, ...newStats }));
    });
    
    socket.on("bot_status", (status: { status: string, reason?: string }) => {
      setBotStatus(status.status);
    });
    
    socket.on("qr_code", (qrUrl: string) => {
      setQrCode(qrUrl);
    });

    return () => {
      socket.off("log_event");
      socket.off("ai_invocation");
      socket.off("stats_update");
      socket.off("bot_status");
      socket.off("qr_code");
    };
  }, [socket]);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <motion.div 
      initial="hidden" 
      animate="visible" 
      variants={STAGGER}
      className="p-8 pb-20 sm:p-12 max-w-7xl mx-auto"
    >
      <motion.header variants={FADE_IN} className="flex flex-col md:flex-row items-start md:items-center justify-between mb-12 gap-4 relative z-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-white/90 to-white/50 bg-clip-text text-transparent drop-shadow-sm">System Overview</h1>
          <p className="text-muted-foreground mt-2 font-medium tracking-wide">Real-time telemetry for your AI Assistant.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="glass px-4 py-2.5 rounded-2xl flex items-center gap-2 text-sm text-muted-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <Search className="w-4 h-4 text-primary" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 w-32 focus:w-48 transition-all duration-300"
            />
          </div>
          {isConnected ? (
            <Badge variant="outline" className="px-4 py-2 rounded-2xl bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.15)] gap-2 font-bold tracking-wide">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse" />
              SYSTEM ONLINE
            </Badge>
          ) : (
            <Badge variant="outline" className="px-4 py-2 rounded-2xl bg-destructive/10 text-destructive border-destructive/30 gap-2 font-bold tracking-wide shadow-[0_0_20px_rgba(239,68,68,0.15)]">
              <div className="w-2.5 h-2.5 rounded-full bg-destructive shadow-[0_0_8px_#ef4444]" />
              DISCONNECTED
            </Badge>
          )}
        </div>
      </motion.header>

      <motion.div variants={STAGGER} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <motion.div variants={FADE_IN}>
          <Card className="glass glass-hover border-none relative overflow-hidden h-full">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Activity className="w-24 h-24" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
              <CardTitle className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
                WhatsApp Status
              </CardTitle>
              <div className={`p-2 rounded-xl ${botStatus === 'connected' ? 'bg-green-500/20 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-yellow-500/20 text-yellow-400 animate-pulse'}`}>
                {botStatus === 'connected' ? <Activity className="w-5 h-5" /> : <Loader2 className="w-5 h-5 animate-spin" />}
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              {botStatus === 'qr_ready' && qrCode ? (
                <div className="flex flex-col items-center justify-center mt-2 group">
                  <div className="p-2 bg-white rounded-xl shadow-[0_0_30px_rgba(255,255,255,0.2)] ring-4 ring-primary/30 group-hover:ring-primary/60 transition-all duration-300">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-28 h-28" />
                  </div>
                  <p className="text-xs mt-4 text-primary font-bold tracking-widest uppercase animate-pulse">Scan to Connect</p>
                </div>
              ) : (
                <div className="mt-2">
                  <div className="text-3xl font-extrabold uppercase tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                    {botStatus.replace('_', ' ')}
                  </div>
                  <p className={`text-sm mt-2 font-medium ${botStatus === 'connected' ? 'text-green-400 drop-shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'text-yellow-400'}`}>
                    {botStatus === 'connected' ? 'Secure socket established' : 'Awaiting handshake...'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <StatsCard 
          title="Active Sessions" 
          value={stats.activeSessions} 
          change="Updated live" 
          icon={<Users className="w-5 h-5 text-blue-400" />}
          iconBg="bg-blue-500/20"
          shadowColor="rgba(59,130,246,0.3)"
        />
        <StatsCard 
          title="Messages Processed" 
          value={stats.messagesProcessed} 
          change="Updated live" 
          icon={<MessageCircle className="w-5 h-5 text-primary" />}
          iconBg="bg-primary/20"
          shadowColor="rgba(124,58,237,0.3)"
        />
        <StatsCard 
          title="Pending Approvals" 
          value={stats.pendingApprovals} 
          change="Requires attention" 
          alert={parseInt(stats.pendingApprovals) > 0}
          icon={<Zap className="w-5 h-5 text-destructive" />}
          iconBg="bg-destructive/20"
          shadowColor="rgba(239,68,68,0.3)"
        />
      </motion.div>

      <motion.div variants={STAGGER} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div variants={FADE_IN} className="lg:col-span-2">
          <Card className="glass glass-hover border-none h-full">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-xl font-bold tracking-tight flex items-center gap-3">
                <div className="p-2 bg-primary/20 rounded-lg ring-1 ring-primary/40 shadow-[0_0_15px_rgba(124,58,237,0.3)]">
                  <Brain className="w-5 h-5 text-primary" />
                </div>
                AI Decision Telemetry
              </CardTitle>
              <CardDescription className="text-sm font-medium">Real-time routing logs and inference statuses.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <AnimatePresence>
                  {invocations.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground text-sm py-8 text-center glass rounded-xl border-dashed border-white/10 font-medium">
                      Awaiting first AI invocation...
                    </motion.div>
                  ) : (
                    invocations.map((log, i) => (
                      <motion.div 
                        key={log.time + i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/5 hover:border-primary/30 hover:bg-white/5 transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-blue-500/20 flex items-center justify-center ring-1 ring-white/10 group-hover:ring-primary/40 shadow-inner">
                            <Zap className="w-4 h-4 text-primary group-hover:text-blue-400 transition-colors" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{log.task}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-mono text-muted-foreground bg-black/40 px-2 py-0.5 rounded-md border border-white/5">{log.time}</span>
                              <span className="text-xs text-primary/80 font-semibold tracking-wide flex items-center gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/60" /> {log.model}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className={`px-3 py-1 font-bold tracking-wide uppercase text-[10px] ${log.status === "success" ? "bg-green-500/10 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(34,197,94,0.1)]" : "bg-destructive/10 text-destructive border-destructive/30 shadow-[0_0_10px_rgba(239,68,68,0.1)]"}`}>
                          {log.status}
                        </Badge>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={FADE_IN}>
          <Card className="border-none h-[500px] flex flex-col shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.05)] bg-[#0A0A0A] ring-1 ring-white/10 overflow-hidden relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-primary opacity-50" />
            <CardHeader className="border-b border-white/10 bg-black/40 pb-4 backdrop-blur-md">
              <CardTitle className="text-sm font-mono tracking-wider flex items-center gap-2 text-white/80">
                <Terminal className="w-4 h-4 text-primary" />
                syslog://backend
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden flex flex-col relative bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.1),rgba(255,255,255,0))]">
              <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px] leading-relaxed scroll-smooth scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {logs.map((log, i) => (
                  <LogEntry key={i} level={log.level} msg={log.msg} time={log.time} />
                ))}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-[#0A0A0A] to-transparent pointer-events-none" />
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function StatsCard({ title, value, change, icon, alert, iconBg, shadowColor }: { title: string; value: string; change: string; icon: React.ReactNode; alert?: boolean, iconBg: string, shadowColor: string }) {
  return (
    <motion.div variants={FADE_IN} className="h-full">
      <Card className="glass glass-hover border-none relative overflow-hidden group h-full flex flex-col">
        <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors duration-500" />
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
          <CardTitle className="text-sm font-bold tracking-wider text-muted-foreground uppercase">
            {title}
          </CardTitle>
          <div className={`p-2.5 rounded-xl ${iconBg} shadow-[0_0_15px_${shadowColor}] ring-1 ring-white/10`}>
            {icon}
          </div>
        </CardHeader>
        <CardContent className="relative z-10 flex-1 flex flex-col justify-end">
          <div className="mt-2 text-4xl font-extrabold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent drop-shadow-sm">{value}</div>
          <p className={`text-xs mt-2 font-medium uppercase tracking-wider ${alert ? 'text-destructive drop-shadow-[0_0_5px_rgba(239,68,68,0.5)] animate-pulse' : 'text-primary/70'}`}>
            {change}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function LogEntry({ level, msg, time }: { level: "info" | "warn" | "error"; msg: string; time: string }) {
  const colors = {
    info: "text-blue-400 drop-shadow-[0_0_2px_rgba(96,165,250,0.4)]",
    warn: "text-yellow-400 drop-shadow-[0_0_2px_rgba(250,204,21,0.4)]",
    error: "text-destructive drop-shadow-[0_0_2px_rgba(239,68,68,0.4)] font-bold"
  };
  
  return (
    <div className="flex gap-3 hover:bg-white/5 p-1 -mx-1 rounded transition-colors group">
      <span className="text-muted-foreground/40 shrink-0 select-none group-hover:text-muted-foreground/70 transition-colors">{time}</span>
      <span className={`${colors[level]} shrink-0 select-none`}>[{level.toUpperCase()}]</span>
      <span className="text-white/70 break-words max-w-full group-hover:text-white transition-colors">{msg}</span>
    </div>
  );
}
