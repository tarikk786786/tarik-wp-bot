"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Save, ShieldAlert, Cpu, Bot, Zap } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Config = {
  botEnabled: boolean;
  replyToGroups: boolean;
  replyToPrivate: boolean;
  smartAutoReply: boolean;
  activeHoursStart: string;
  activeHoursEnd: string;
};

type Contact = {
  _id: string;
  phoneNumber: string;
  name?: string;
  isVIP: boolean;
  mode: 'autonomous' | 'approval' | 'manual';
};

export default function SettingsDashboard() {
  const [config, setConfig] = useState<Config | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configRes, contactsRes] = await Promise.all([
        fetch(`${API_URL}/api/config`),
        fetch(`${API_URL}/api/contacts`)
      ]);
      const configData = await configRes.json();
      const contactsData = await contactsRes.json();
      setConfig(configData);
      setContacts(contactsData);
    } catch (err) {
      console.error("Failed to fetch settings", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await fetch(`${API_URL}/api/config`, {
        method: "POST", // The api endpoint is POST /config
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      // Optionally show a success toast here
    } catch (err) {
      console.error("Failed to save config", err);
    } finally {
      setSaving(false);
    }
  };

  const updateContactMode = async (id: string, mode: Contact['mode'], isVIP: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, isVIP })
      });
      if (res.ok) {
        setContacts(contacts.map(c => c._id === id ? { ...c, mode, isVIP } : c));
      }
    } catch (err) {
      console.error("Failed to update contact", err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white/50">Loading settings...</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Settings className="w-8 h-8 text-primary" />
            System Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global bot behavior and individual contact rules.
          </p>
        </div>
        <Button 
          onClick={handleSaveConfig} 
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global Config Card */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Global Bot Settings
            </CardTitle>
            <CardDescription className="text-white/60">
              Control the main operating parameters of your AI clone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {config && (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-white/90">Master Switch</label>
                    <p className="text-xs text-white/50">Enable or disable the bot entirely</p>
                  </div>
                  <Switch 
                    checked={config.botEnabled} 
                    onCheckedChange={(c) => setConfig({ ...config, botEnabled: c })} 
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-white/90">Smart Auto Reply</label>
                    <p className="text-xs text-white/50">Pause replies when you are actively typing on WhatsApp</p>
                  </div>
                  <Switch 
                    checked={config.smartAutoReply} 
                    onCheckedChange={(c) => setConfig({ ...config, smartAutoReply: c })} 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-white/90">Reply to Groups</label>
                    <p className="text-xs text-white/50">Allow bot to respond in group chats</p>
                  </div>
                  <Switch 
                    checked={config.replyToGroups} 
                    onCheckedChange={(c) => setConfig({ ...config, replyToGroups: c })} 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/90">Active Hours Start</label>
                    <Input 
                      type="time" 
                      value={config.activeHoursStart}
                      onChange={(e) => setConfig({ ...config, activeHoursStart: e.target.value })}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white/90">Active Hours End</label>
                    <Input 
                      type="time" 
                      value={config.activeHoursEnd}
                      onChange={(e) => setConfig({ ...config, activeHoursEnd: e.target.value })}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Contact Mode Overrides */}
        <Card className="bg-white/5 border-white/10 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Contact Rules
            </CardTitle>
            <CardDescription className="text-white/60">
              Override global settings for specific known contacts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contacts.length === 0 ? (
              <p className="text-sm text-white/50 text-center py-8">No known contacts yet. Conversations will appear here.</p>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {contacts.map(contact => (
                  <div key={contact._id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-lg bg-white/5 border border-white/5">
                    <div>
                      <p className="text-sm font-medium text-white/90">
                        {contact.name || contact.phoneNumber}
                      </p>
                      <p className="text-xs text-white/50">
                        {contact.isVIP ? "VIP (OpenAI/DeepSeek) 💎" : "Standard (Gemini)"}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select 
                        className="bg-black/40 border border-white/10 text-sm rounded-md px-2 py-1 text-white/90 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={contact.mode}
                        onChange={(e) => updateContactMode(contact._id, e.target.value as Contact['mode'], contact.isVIP)}
                      >
                        <option value="autonomous">Autonomous (Auto-reply)</option>
                        <option value="approval">Approval (Queue)</option>
                        <option value="manual">Manual (Ignore)</option>
                      </select>

                      <Button 
                        variant="ghost" 
                        size="icon"
                        className={`h-7 w-7 ${contact.isVIP ? 'text-primary bg-primary/10' : 'text-white/30 hover:text-white'}`}
                        onClick={() => updateContactMode(contact._id, contact.mode, !contact.isVIP)}
                        title="Toggle VIP Status (Forces advanced AI model)"
                      >
                        <Zap className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
