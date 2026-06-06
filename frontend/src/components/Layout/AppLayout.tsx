import { Link, Outlet } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-start h-14">
            <Link
              to="/"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg text-foreground">
                领导力共创研讨会
              </span>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
