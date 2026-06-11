import React from "react";
import { 
  LayoutDashboard, Mic, ShieldAlert, BookOpen, 
  Award, Sparkles, Settings, LogOut, TrendingUp, HelpCircle, FileText
} from "lucide-react";

type NavScreen = "dashboard" | "jam" | "debate" | "interview" | "dna" | "coach" | "history" | "leaderboard" | "doc_analyzer";

interface SidebarProps {
  currentScreen: string;
  onNavigate: (screen: any) => void;
  onLogout: () => void;
  user: any;
}

export default function Sidebar({ currentScreen, onNavigate, onLogout, user }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "jam", label: "JAM Analyzer", icon: Mic },
    { id: "debate", label: "Debate Arena", icon: ShieldAlert },
    { id: "interview", label: "Interview Simulator", icon: BookOpen },
    { id: "dna", label: "Communication DNA", icon: Award },
    { id: "coach", label: "AI Coach", icon: Sparkles },
    { id: "history", label: "Growth Analytics", icon: TrendingUp },
    { id: "doc_analyzer", label: "Document Communication Analyzer", icon: FileText },
  ];

  return (
    <aside className="w-64 bg-[#FFFFFF] border-r border-slate-200 h-screen flex flex-col justify-between shrink-0 select-none">
      <div className="flex flex-col gap-6 p-6">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-slate-900 text-sm tracking-tight">TwinAI</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Communication Coach</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex flex-col gap-1 mt-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id as NavScreen)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all text-left ${
                  isActive 
                    ? "bg-blue-50 text-blue-600" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className={`h-4.5 w-4.5 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User profile & controls footer */}
      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-4">
        {user && (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
              {user.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-800 truncate">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button 
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-500 hover:text-red-600 hover:bg-red-50/50 rounded-lg text-xs font-medium transition-all text-left"
          >
            <LogOut className="h-4.5 w-4.5" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
