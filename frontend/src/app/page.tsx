"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, MessageCircle, Brain, Users, Zap, Search } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";

type LogEvent = { level: "info" | "warn" | "error"; msg: string; time: string };
type AIInvocation = { time: string; model: string; task: string; status: string };

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

  useEffect(() => {
    if (!socket) return;

    socket.on("log_event", (log: LogEvent) => {
      setLogs((prev) => [log, ...prev].slice(0, 50)); // Keep last 50 logs
    });

    socket.on("ai_invocation", (invoc: AIInvocation) => {
      setInvocations((prev) => [invoc, ...prev].slice(0, 20));
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

  return (
    <div className="p-8 pb-20 sm:p-12">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Status</h1>
          <p className="text-muted-foreground mt-1 text-sm">Real-time overview of your AI WhatsApp Assistant.</p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <Badge variant="outline" className="px-3 py-1.5 bg-green-500/10 text-green-500 border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)] gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              System Online
            </Badge>
          ) : (
            <Badge variant="outline" className="px-3 py-1.5 bg-destructive/10 text-destructive border-destructive/20 gap-1.5">
              <div className="w-2 h-2 rounded-full bg-destructive" />
              Disconnected
            </Badge>
          )}
          <div className="glass px-4 py-2 rounded-xl flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search logs..." 
              className="bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50 w-32 focus:w-48 transition-all"
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="glass border-none relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              WhatsApp Status
            </CardTitle>
            <div className="p-2 rounded-full bg-white/5">
              <Activity className={`w-4 h-4 ${botStatus === 'connected' ? 'text-green-400' : 'text-yellow-400'}`} />
            </div>
          </CardHeader>
          <CardContent>
            {botStatus === 'qr_ready' && qrCode ? (
              <div className="flex flex-col items-center justify-center mt-2">
                <img src={qrCode} alt="WhatsApp QR Code" className="w-32 h-32 rounded-lg" />
                <p className="text-xs mt-2 text-yellow-400 font-medium">Scan to connect</p>
              </div>
            ) : (
              <>
                <div className="text-2xl font-bold uppercase">{botStatus.replace('_', ' ')}</div>
                <p className={`text-xs mt-1 ${botStatus === 'connected' ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {botStatus === 'connected' ? 'Bot is running' : 'Waiting for connection'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <StatsCard 
          title="Active Sessions" 
          value={stats.activeSessions} 
          change="Updated live" 
          icon={<Users className="w-4 h-4 text-blue-400" />}
        />
        <StatsCard 
          title="Messages Processed" 
          value={stats.messagesProcessed} 
          change="Updated live" 
          icon={<MessageCircle className="w-4 h-4 text-primary" />}
        />
        <StatsCard 
          title="Pending Approvals" 
          value={stats.pendingApprovals} 
          change="Updated live" 
          alert={parseInt(stats.pendingApprovals) > 0}
          icon={<Zap className="w-4 h-4 text-destructive" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass border-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Recent AI Invocations
            </CardTitle>
            <CardDescription>Latest routing decisions and model responses.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {invocations.length === 0 ? (
                <div className="text-muted-foreground text-sm py-4 text-center">No recent invocations.</div>
              ) : (
                invocations.map((log, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{log.task}</p>
                        <p className="text-xs text-muted-foreground">{log.time} • Routed to {log.model}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={log.status === "success" ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                      {log.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-none">
          <CardHeader>
            <CardTitle className="text-lg">System Logs</CardTitle>
            <CardDescription>Real-time backend events.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 font-mono text-xs">
              {logs.map((log, i) => (
                <LogEntry key={i} level={log.level} msg={log.msg} time={log.time} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatsCard({ title, value, change, icon, alert }: { title: string; value: string; change: string; icon: React.ReactNode; alert?: boolean }) {
  return (
    <Card className="glass border-none relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-full ${alert ? 'bg-destructive/10' : 'bg-white/5'}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs mt-1 ${alert ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {change}
        </p>
      </CardContent>
    </Card>
  );
}

function LogEntry({ level, msg, time }: { level: "info" | "warn" | "error"; msg: string; time: string }) {
  const colors = {
    info: "text-blue-400",
    warn: "text-yellow-400",
    error: "text-destructive"
  };
  
  return (
    <div className="flex gap-3 pb-3 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground/50 shrink-0">{time}</span>
      <span className={`${colors[level]} font-semibold shrink-0`}>[{level.toUpperCase()}]</span>
      <span className="text-muted-foreground break-words max-w-full">{msg}</span>
    </div>
  );
}
