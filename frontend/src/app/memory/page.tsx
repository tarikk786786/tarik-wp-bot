"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Trash2, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

type Contact = {
  _id: string;
  phoneNumber: string;
  name?: string;
  isVIP: boolean;
  mode: string;
};

type Memory = {
  _id: string;
  contactId: Contact;
  content: string;
  source: string;
  importance: number;
  metadata: { timestamp: string; topic?: string; sentiment?: string };
};

export default function MemoryDashboard() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/memory`);
      const data = await res.json();
      setMemories(data);
    } catch (err) {
      console.error("Failed to fetch memories", err);
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await fetch(`${API_URL}/api/memory/${id}`, { method: "DELETE" });
      setMemories(memories.filter((m) => m._id !== id));
    } catch (err) {
      console.error("Failed to delete memory", err);
    }
  };

  const filteredMemories = memories.filter((m) => 
    m.content.toLowerCase().includes(search.toLowerCase()) || 
    m.contactId?.phoneNumber.includes(search)
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Brain className="w-8 h-8 text-primary" />
            Semantic Memory
          </h1>
          <p className="text-muted-foreground mt-1">
            Long-term knowledge base extracted from user conversations.
          </p>
        </div>
        
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search memories..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white focus-visible:ring-primary/50"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-20 text-center text-muted-foreground">Loading memories...</div>
        ) : filteredMemories.length === 0 ? (
          <div className="col-span-full py-20 text-center text-muted-foreground flex flex-col items-center gap-3">
            <Brain className="w-12 h-12 opacity-20" />
            <p>No memories found matching your search.</p>
          </div>
        ) : (
          filteredMemories.map((memory) => (
            <Card key={memory._id} className="bg-white/5 border-white/10 backdrop-blur-xl relative group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-full bg-primary/20 text-primary">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-white/90 font-medium">
                        {memory.contactId?.name || memory.contactId?.phoneNumber}
                      </CardTitle>
                      <CardDescription className="text-xs text-white/50">
                        {new Date(memory.metadata?.timestamp || Date.now()).toLocaleString()}
                      </CardDescription>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-white/30 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deleteMemory(memory._id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/80 leading-relaxed">
                  {memory.content}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60">
                    Imp: {memory.importance}/10
                  </Badge>
                  {memory.metadata?.topic && (
                    <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary/80">
                      {memory.metadata.topic}
                    </Badge>
                  )}
                  <Badge variant="outline" className="bg-white/5 border-white/10 text-white/60 capitalize">
                    {memory.source}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
