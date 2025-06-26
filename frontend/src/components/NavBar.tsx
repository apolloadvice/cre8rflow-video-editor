import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Bell, Settings, Video, Menu } from "lucide-react";

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  const navLinks = [
    { name: "Dashboard", path: "/dashboard" },
    { name: "Projects", path: "/projects" },
    { name: "Templates", path: "/templates" },
    { name: "Billing", path: "/billing" },
    { name: "Account", path: "/account" },
  ];

  return (
    <header className="w-full bg-cre8r-gray-800 border-b border-cre8r-gray-700">
      <div className="h-14 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div 
            className="flex items-center gap-2 cursor-pointer" 
            onClick={() => navigate("/")}
          >
            <div className="rounded-full p-1.5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cre8r-violet-dark to-cre8r-gray-800 rounded-full"></div>
              <div className="relative bg-gradient-to-tr from-cre8r-violet-dark to-cre8r-violet-light rounded-full p-1.5">
                <Video className="w-5 h-5 text-white relative z-10" />
              </div>
            </div>
            <span className="text-lg font-semibold text-white">
              Cre8rFlow
            </span>
          </div>

          <nav className="hidden md:flex gap-1 ml-6">
            {navLinks.map((link) => (
              <Button
                key={link.name}
                variant="ghost"
                className={cn(
                  "text-cre8r-gray-300 hover:text-white hover:bg-cre8r-gray-700",
                  pathname === link.path && "bg-cre8r-gray-700 text-white"
                )}
                onClick={() => navigate(link.path)}
              >
                {link.name}
              </Button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings className="h-5 w-5" />
          </Button>
          <Button 
            variant="default"
            className="ml-2 bg-cre8r-violet hover:bg-cre8r-violet-dark"
            onClick={() => navigate("/editor")}
          >
            New Project
          </Button>
        </div>
      </div>
    </header>
  );
};

export default NavBar;
