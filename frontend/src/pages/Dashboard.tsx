import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NavBar from "@/components/NavBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

interface Project {
  id: string;
  name: string;
  thumbnail: string;
  updatedAt: Date;
  duration: number;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Remove default projects
  const [projects] = useState<Project[]>([]);

  // Format date as "Apr 25, 2025"
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Format duration as "2:07"
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Filter projects based on search query
  const filteredProjects = searchQuery
    ? projects.filter((project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  return (
    <div className="flex flex-col min-h-screen bg-cre8r-dark">
      <NavBar />
      
      <div className="flex-1 container mx-auto py-8 px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Your Projects</h1>
            <p className="text-cre8r-gray-300 mt-1">
              Create and manage your video projects
            </p>
          </div>
          
          <div className="flex gap-3 self-stretch md:self-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-cre8r-gray-400" />
              <Input
                type="text"
                placeholder="Search projects..."
                className="pl-9 bg-cre8r-gray-800 border-cre8r-gray-700"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              className="bg-cre8r-violet hover:bg-cre8r-violet-dark"
              onClick={() => navigate("/editor")}
            >
              <Plus className="h-5 w-5 mr-2" />
              New Project
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card 
            className="bg-cre8r-gray-800 border border-cre8r-gray-700 hover:border-cre8r-violet transition-colors cursor-pointer group"
            onClick={() => navigate("/editor")}
          >
            <CardContent className="p-0">
              <div className="flex items-center justify-center h-48 bg-cre8r-gray-700 rounded-t-lg">
                <div className="w-16 h-16 rounded-full bg-cre8r-gray-800/80 flex items-center justify-center group-hover:bg-cre8r-violet/20 transition-colors">
                  <Plus className="h-8 w-8 text-cre8r-gray-300 group-hover:text-cre8r-violet transition-colors" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-center p-4">
              <span className="text-lg font-medium">Create New Project</span>
            </CardFooter>
          </Card>

          {projects.length === 0 && (
            <div className="text-center text-cre8r-gray-400 col-span-full py-8">
              No projects yet. Click "New Project" to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
