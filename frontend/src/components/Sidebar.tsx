import React from "react";
import Link from "next/link";
import { Bot, MessageSquareText, Settings, UserCircle, Activity, BrainCircuit } from "lucide-react";

export function Sidebar() {
  return (
    <div className="w-64 h-screen fixed left-0 top-0 border-r border-white/5 bg-background/40 backdrop-blur-3xl flex flex-col pt-8 pb-6 px-4 z-50 shadow-[4px_0_24px_-8px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-3 px-3 mb-12">
        <div className="p-2.5 bg-gradient-to-br from-primary/30 to-blue-500/20 text-primary rounded-xl ring-1 ring-primary/40 shadow-[0_0_20px_rgba(124,58,237,0.4)]">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-primary/80 to-blue-400 bg-clip-text text-transparent drop-shadow-sm">OpenHuman</span>
          <span className="text-xs text-primary/70 font-semibold tracking-wider uppercase mt-0.5">AI Assistant</span>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <NavItem href="/" icon={<Activity />} label="Dashboard" active />
        <NavItem href="/queue" icon={<MessageSquareText />} label="Approval Queue" badge="3" />
        <NavItem href="/memory" icon={<Bot />} label="AI Memory" />
        <NavItem href="/settings" icon={<Settings />} label="Settings" />
      </nav>

      <div className="mt-auto pt-6 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all duration-300 cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-blue-600 p-[1px] shadow-[0_0_15px_rgba(124,58,237,0.3)] group-hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] transition-shadow">
            <div className="w-full h-full bg-card rounded-full flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold group-hover:text-primary transition-colors">Tarik</span>
            <span className="text-xs text-muted-foreground font-medium">System Admin</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ href, icon, label, active, badge }: { href: string; icon: React.ReactNode; label: string; active?: boolean; badge?: string }) {
  return (
    <Link href={href}>
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-300 group relative overflow-hidden ${
        active 
          ? "bg-primary/10 text-primary ring-1 ring-primary/30 shadow-[0_0_15px_rgba(124,58,237,0.15),inset_0_1px_1px_rgba(255,255,255,0.05)]" 
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
      }`}>
        {active && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary shadow-[0_0_10px_rgba(124,58,237,0.8)]" />
        )}
        <div className="flex items-center gap-3">
          <div className={`${active ? "text-primary drop-shadow-[0_0_8px_rgba(124,58,237,0.5)]" : "text-muted-foreground group-hover:text-foreground group-hover:scale-110 transition-transform"} [&>svg]:w-5 [&>svg]:h-5`}>
            {icon}
          </div>
          <span className={`text-sm ${active ? 'font-bold' : 'font-medium group-hover:translate-x-1 transition-transform'}`}>{label}</span>
        </div>
        {badge && (
          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-primary to-blue-600 text-white text-[10px] font-bold shadow-[0_0_10px_rgba(124,58,237,0.5)]">
            {badge}
          </span>
        )}
      </div>
    </Link>
  );
}
