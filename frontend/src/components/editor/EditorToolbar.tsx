import { Film, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import UndoIcon from "@/components/icons/UndoIcon";
import RedoIcon from "@/components/icons/RedoIcon";
import { useToast } from "@/hooks/use-toast";
import { useEditorStore } from "@/store/editorStore";
import React, { useState, useRef } from "react";

interface EditorToolbarProps {
  activeVideoName?: string;
}

const EditorToolbar = ({ activeVideoName }: EditorToolbarProps) => {
  const { toast } = useToast();
  const { undo, redo, history, projectName, setProjectName } = useEditorStore();
  const [editing, setEditing] = useState(false);
  const [tempName, setTempName] = useState(projectName);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSaveProject = () => {
    toast({
      title: "Project saved",
      description: "Your project has been saved successfully",
    });
  };

  const handleRenderVideo = () => {
    toast({
      title: "Rendering started",
      description: "Your video is now being rendered",
    });
  };

  const handleNameClick = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempName(e.target.value);
  };

  const saveName = () => {
    setProjectName(tempName.trim() || "Untitled Project");
    setEditing(false);
  };

  const handleNameBlur = () => {
    saveName();
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      saveName();
    } else if (e.key === "Escape") {
      setTempName(projectName);
      setEditing(false);
    }
  };

  return (
    <div className="flex justify-between items-center px-4 h-14 border-b border-cre8r-gray-700 bg-cre8r-gray-800">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-cre8r-violet rounded-full flex items-center justify-center">
          <Film className="h-5 w-5 text-white" />
        </div>
        {editing ? (
          <input
            ref={inputRef}
            className="text-lg font-semibold bg-transparent border-b border-cre8r-violet outline-none text-white px-1 w-48"
            value={tempName}
            onChange={handleNameChange}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            maxLength={64}
          />
        ) : (
          <h1
            className="text-lg font-semibold text-white cursor-pointer hover:underline"
            onClick={handleNameClick}
            title="Click to edit project name"
          >
            {projectName}
          </h1>
        )}
      </div>
      
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          className="border-cre8r-gray-600 hover:border-cre8r-violet"
          onClick={() => undo()}
          disabled={history.past.length === 0}
        >
          <UndoIcon className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          className="border-cre8r-gray-600 hover:border-cre8r-violet"
          onClick={() => redo()}
          disabled={history.future.length === 0}
        >
          <RedoIcon className="h-4 w-4" />
        </Button>
        
        <Button
          variant="outline"
          className="border-cre8r-gray-600 hover:border-cre8r-violet"
          onClick={handleSaveProject}
        >
          <Save className="h-4 w-4 mr-2" />
          Save Project
        </Button>
        
        <Button
          className="bg-cre8r-violet hover:bg-cre8r-violet-dark"
          onClick={handleRenderVideo}
        >
          Render Video
        </Button>
      </div>
    </div>
  );
};

export default EditorToolbar;
