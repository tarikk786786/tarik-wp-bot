"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, AlertTriangle, User, Bot, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSocket } from "@/hooks/useSocket";

type PendingMessage = {
  id: string;
  sender: string;
  time: string;
  priority: "high" | "medium" | "low";
  originalMessage: string;
  proposedReply: string;
  model: string;
  confidence: number;
};

export default function ApprovalQueue() {
  const { socket, isConnected } = useSocket();
  const [queue, setQueue] = useState<PendingMessage[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);

  useEffect(() => {
    if (!socket) return;

    socket.on("pending_approval", (msg: PendingMessage) => {
      setQueue((prev) => {
        // prevent duplicates
        if (prev.some(m => m.id === msg.id)) return prev;
        return [msg, ...prev];
      });
    });

    socket.on("message_resolved", (id: string) => {
      setQueue((prev) => prev.filter(m => m.id !== id));
    });

    return () => {
      socket.off("pending_approval");
      socket.off("message_resolved");
    };
  }, [socket]);

  const handleApprove = (id: string, customReply?: string) => {
    if (socket) {
      socket.emit("approve_message", { id, customReply });
      setQueue((prev) => prev.filter(m => m.id !== id));
    }
  };

  const handleReject = (id: string) => {
    if (socket) {
      socket.emit("reject_message", { id });
      setQueue((prev) => prev.filter(m => m.id !== id));
    }
  };

  return (
    <div className="p-8 pb-20 sm:p-12 max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Queue</h1>
          <p className="text-muted-foreground mt-1 text-sm">Review and approve AI-generated messages before they are sent.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary" className="px-3 py-1 text-sm font-medium">{queue.length} Pending</Badge>
          <Badge variant="outline" className={`px-3 py-1 text-sm font-medium cursor-pointer transition-colors ${autoApprove ? "border-green-500 text-green-500 bg-green-500/10" : "border-primary/20 text-primary"}`} onClick={() => setAutoApprove(!autoApprove)}>
            Auto-Approve: {autoApprove ? "On" : "Off"}
          </Badge>
        </div>
      </header>

      <div className="space-y-6">
        {queue.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground border border-dashed border-white/10 rounded-xl bg-white/5">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500/50" />
            <h3 className="text-lg font-medium text-foreground">You're all caught up!</h3>
            <p className="text-sm mt-1">No messages are currently waiting for your approval.</p>
          </div>
        ) : (
          queue.map((item) => (
            <PendingApprovalItem 
              key={item.id}
              {...item}
              onApprove={() => handleApprove(item.id)}
              onReject={() => handleReject(item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PendingApprovalItem({ 
  sender, time, priority, originalMessage, proposedReply, model, confidence, onApprove, onReject
}: PendingMessage & { onApprove: () => void; onReject: () => void; }) {
  const priorityColors = {
    high: "bg-destructive/10 text-destructive border-destructive/20",
    medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    low: "bg-blue-500/10 text-blue-500 border-blue-500/20"
  };

  return (
    <Card className="glass border-white/5 overflow-hidden transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
      <CardHeader className="pb-4 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border border-white/10">
              <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                {sender.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">{sender}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-0.5">
                <Clock className="w-3 h-3" /> {time}
              </CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={priorityColors[priority]}>
            {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-6 grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <User className="w-4 h-4" /> Received Message
          </div>
          <div className="bg-white/5 rounded-xl p-4 text-sm leading-relaxed border border-white/5 whitespace-pre-wrap">
            {originalMessage}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="w-4 h-4" /> Proposed AI Reply
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10">{model}</Badge>
              <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">{confidence}% Confidence</Badge>
            </div>
          </div>
          <div className="bg-primary/5 rounded-xl p-4 text-sm leading-relaxed border border-primary/20 relative whitespace-pre-wrap">
            {proposedReply}
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t border-white/5 bg-white/[0.01] pt-4 flex justify-end gap-3">
        <Button variant="outline" className="border-white/10 hover:bg-white/5 hover:text-white">
          Edit Reply
        </Button>
        <Button variant="outline" className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onReject}>
          <XCircle className="w-4 h-4 mr-2" /> Reject
        </Button>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(124,58,237,0.4)]" onClick={onApprove}>
          <CheckCircle2 className="w-4 h-4 mr-2" /> Approve & Send
        </Button>
      </CardFooter>
    </Card>
  );
}
