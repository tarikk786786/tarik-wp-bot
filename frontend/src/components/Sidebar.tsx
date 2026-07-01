import React from "react";
import Link from "next/link";
import { Bot, MessageSquareText, Settings, UserCircle, Activity, BrainCircuit } from "lucide-react";

export function Sidebar() {
  return (
    <div className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-background/50 backdrop-blur-3xl flex flex-col pt-6 pb-6 px-4 z-50">
      <div className="flex items-center gap-3 px-2 mb-10">
        <div className="p-2 bg-primary/20 text-primary rounded-xl ring-1 ring-primary/30 shadow-[0_0_15px_rgba(124,58,237,0.3)]">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">OpenHuman</span>
          <span className="text-xs text-muted-foreground font-medium">AI Assistant</span>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <NavItem href="/" icon={<Activity />} label="Dashboard" active />
        <NavItem href="/queue" icon={<MessageSquareText />} label="Approval Queue" badge="3" />
        <NavItem href="/memory" icon={<Bot />} label="AI Memory" />
        <NavItem href="/settings" icon={<Settings />} label="Settings" />
      </nav>

      <div className="mt-auto pt-6 border-t border-white/5">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-blue-600/80 p-0.5">
            <div className="w-full h-full bg-card rounded-full flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">Tarik</span>
            <span className="text-xs text-muted-foreground">Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, icon, label, active, badge }: { href: string; icon: React.ReactNode; label: string; active?: boolean; badge?: string }) {
  return (
    <Link href={href}>
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 group ${
        active 
          ? "bg-primary/10 text-primary ring-1 ring-primary/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" 
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}>
        <div className="flex items-center gap-3">
          <div className={`${active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"} [&>svg]:w-5 [&>svg]:h-5`}>
            {icon}
          </div>
          <span className="text-sm font-medium">{label}</span>
        </div>
        {badge && (
          <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
