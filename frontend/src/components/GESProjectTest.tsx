import React, { useEffect, useState } from 'react';
import {
  useGESAvailability,
  useCurrentGESProject,
  useGESProjectActions,
  useGESLoading,
  useGESError,
  useGESProjects,
  LayerType,
  getLayerName,
  getLayerColor
} from '../store/editorStore';
import { useEditorStore } from '../store/editorStore';

const GESProjectTest: React.FC = () => {
  const gesAvailable = useGESAvailability();
  const currentProject = useCurrentGESProject();
  const gesActions = useGESProjectActions();
  const isLoading = useGESLoading();
  const error = useGESError();
  
  // Enhanced Project Actions
  const {
    loadProjectTemplates,
    createProjectFromTemplate,
    saveCurrentProjectToFile,
    loadProjectFromFile,
    validateCurrentProject,
    runBatchOperation,
    getAvailableTemplates,
    getLastValidationResult,
    isBatchOperationInProgress,
    getLastBatchResult
  } = useEditorStore();

  const [testResults, setTestResults] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('youtube_1080p');
  const [projectNameInput, setProjectNameInput] = useState<string>('Test Project from Template');
  const [filePathInput, setFilePathInput] = useState<string>('/tmp/test_project.json');
  
  const availableTemplates = getAvailableTemplates();
  const lastValidationResult = getLastValidationResult();
  const batchInProgress = isBatchOperationInProgress();
  const lastBatchResult = getLastBatchResult();
  const gesProjects = useGESProjects();
  
  const addTestResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`]);
  };
  
  useEffect(() => {
    // Check GES availability on component mount
    gesActions.checkAvailability().then(available => {
      addTestResult(`GES Available: ${available}`);
    });
  }, [gesActions]);
  
  const testCreateProject = async () => {
    addTestResult('Creating test project...');
    const projectId = await gesActions.createProject('Test Project', {
      width: 1920,
      height: 1080,
      framerate: '30/1'
    });
    
    if (projectId) {
      addTestResult(`✅ Project created: ${projectId}`);
    } else {
      addTestResult('❌ Failed to create project');
    }
  };
  
  const testAddAsset = async () => {
    if (!currentProject) {
      addTestResult('❌ No current project');
      return;
    }
    
    addTestResult('Adding test asset...');
    // Use a placeholder path for testing
    const assetId = await gesActions.addAsset(currentProject.id, '/path/to/test/video.mp4');
    
    if (assetId) {
      addTestResult(`✅ Asset added: ${assetId}`);
    } else {
      addTestResult('❌ Failed to add asset');
    }
  };
  
  const testAddTitleClip = async () => {
    if (!currentProject) {
      addTestResult('❌ No current project');
      return;
    }
    
    addTestResult('Adding title clip...');
    const clipId = await gesActions.addTitleClip(
      currentProject.id, 
      LayerType.TEXT, 
      0, 
      5, 
      'Test Title'
    );
    
    if (clipId) {
      addTestResult(`✅ Title clip added: ${clipId}`);
    } else {
      addTestResult('❌ Failed to add title clip');
    }
  };
  
  const testTimelineMarker = async () => {
    if (!currentProject) {
      addTestResult('❌ No current project');
      return;
    }
    
    addTestResult('Adding timeline marker...');
    const markerId = await gesActions.addTimelineMarker(
      currentProject.id, 
      10.0, 
      'Test Marker', 
      '#ff0000'
    );
    
    if (markerId) {
      addTestResult(`✅ Timeline marker added: ${markerId}`);
    } else {
      addTestResult('❌ Failed to add timeline marker');
    }
  };
  
  const testAddTimelineMarker = async () => {
    if (!currentProject) return;
    
    addTestResult('Adding timeline marker...');
    const markerId = await gesActions.addTimelineMarker(
      currentProject.id, 
      10.0, 
      'Test Marker', 
      '#ff0000',
      'This is a test marker'
    );
    
    if (markerId) {
      addTestResult(`✅ Timeline marker added: ${markerId}`);
    } else {
      addTestResult('❌ Failed to add timeline marker');
    }
  };
  
  // Enhanced Project Action Test Functions
  const testLoadTemplates = async () => {
    addTestResult('Loading project templates...');
    await loadProjectTemplates();
    const templates = getAvailableTemplates();
    addTestResult(`✅ Loaded ${Object.keys(templates).length} templates: ${Object.keys(templates).join(', ')}`);
  };
  
  const testCreateFromTemplate = async () => {
    addTestResult(`Creating project from template: ${selectedTemplate}...`);
    const projectId = await createProjectFromTemplate(selectedTemplate, projectNameInput);
    
    if (projectId) {
      addTestResult(`✅ Project created from template: ${projectId}`);
    } else {
      addTestResult('❌ Failed to create project from template');
    }
  };
  
  const testSaveProject = async () => {
    if (!currentProject) {
      addTestResult('❌ No current project to save');
      return;
    }
    
    addTestResult(`Saving project to: ${filePathInput}...`);
    await saveCurrentProjectToFile(filePathInput, true, false);
    addTestResult(`✅ Project saved to ${filePathInput}`);
  };
  
  const testLoadProject = async () => {
    addTestResult(`Loading project from: ${filePathInput}...`);
    const projectId = await loadProjectFromFile(filePathInput);
    
    if (projectId) {
      addTestResult(`✅ Project loaded: ${projectId}`);
    } else {
      addTestResult('❌ Failed to load project from file');
    }
  };
  
  const testValidateProject = async () => {
    if (!currentProject) {
      addTestResult('❌ No current project to validate');
      return;
    }
    
    addTestResult('Validating current project...');
    const result = await validateCurrentProject(true, true, false);
    
    if (result) {
      addTestResult(`✅ Validation complete - Valid: ${result.project_valid}`);
      if (result.issues_found.length > 0) {
        addTestResult(`⚠️ Issues found: ${result.issues_found.join(', ')}`);
      }
    } else {
      addTestResult('❌ Failed to validate project');
    }
  };
  
      const testBatchOperation = async () => {
      const projectIds = Object.keys(gesProjects);
      if (projectIds.length === 0) {
        addTestResult('❌ No projects available for batch operation');
        return;
      }
    
    addTestResult(`Running batch validation on ${projectIds.length} projects...`);
    const result = await runBatchOperation(projectIds, 'validate');
    
    if (result) {
      addTestResult(`✅ Batch operation complete - Success rate: ${(result.successful.length / result.total_projects * 100).toFixed(1)}%`);
    } else {
      addTestResult('❌ Failed to run batch operation');
    }
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">GES Project Management Test</h1>
      
      {/* Status Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`p-4 rounded-lg ${gesAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          <h3 className="font-semibold">GES Status</h3>
          <p>{gesAvailable ? '✅ Available' : '❌ Not Available'}</p>
        </div>
        
        <div className={`p-4 rounded-lg ${isLoading ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}`}>
          <h3 className="font-semibold">Loading</h3>
          <p>{isLoading ? '⏳ Loading...' : '✅ Ready'}</p>
        </div>
        
        <div className={`p-4 rounded-lg ${error ? 'bg-red-100 text-red-800' : 'bg-gray-100'}`}>
          <h3 className="font-semibold">Error</h3>
          <p>{error || '✅ No errors'}</p>
        </div>
      </div>
      
      {/* Current Project Info */}
      {currentProject && (
        <div className="bg-blue-50 p-4 rounded-lg mb-6">
          <h3 className="font-semibold text-blue-800 mb-2">Current Project</h3>
          <div className="text-sm text-blue-700">
            <p><strong>ID:</strong> {currentProject.id}</p>
            <p><strong>Name:</strong> {currentProject.name}</p>
            <p><strong>Resolution:</strong> {currentProject.metadata.width}x{currentProject.metadata.height}</p>
            <p><strong>Framerate:</strong> {currentProject.metadata.framerate}</p>
            <p><strong>Status:</strong> {currentProject.status}</p>
            <p><strong>Assets:</strong> {Object.keys(currentProject.assets).length}</p>
            <p><strong>Clips:</strong> {Object.keys(currentProject.clips).length}</p>
            <p><strong>Markers:</strong> {Object.keys(currentProject.markers).length}</p>
          </div>
        </div>
      )}
      
      {/* Layer Types Display */}
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="font-semibold mb-2">Layer Types</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.values(LayerType).filter(v => typeof v === 'number').map(layer => (
            <div 
              key={layer}
              className="p-2 rounded text-white text-sm text-center"
              style={{ backgroundColor: getLayerColor(layer as LayerType) }}
            >
              <div className="font-semibold">{getLayerName(layer as LayerType)}</div>
              <div className="text-xs">Priority {layer}</div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Test Actions */}
      <div className="space-y-4 mb-6">
        <h3 className="font-semibold">Test Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <button 
            onClick={testCreateProject}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Create Project
          </button>
          
          <button 
            onClick={testAddAsset}
            disabled={isLoading || !currentProject}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
          >
            Add Asset
          </button>
          
          <button 
            onClick={testAddTitleClip}
            disabled={isLoading || !currentProject}
            className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
          >
            Add Title Clip
          </button>
          
          <button 
            onClick={testTimelineMarker}
            disabled={isLoading || !currentProject}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
          >
            Add Marker
          </button>
        </div>
      </div>

      {/* Enhanced Project Actions */}
      <div className="space-y-4 mb-6">
        <h3 className="font-semibold">Enhanced Project Actions</h3>
        
        {/* Template Management */}
        <div className="bg-purple-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3 text-purple-800">Template Management</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="youtube_1080p">YouTube 1080p</option>
                <option value="instagram_story">Instagram Story</option>
                <option value="podcast">Podcast</option>
                <option value="documentary">Documentary</option>
                <option value="music_video">Music Video</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <input
                type="text"
                value={projectNameInput}
                onChange={(e) => setProjectNameInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={testLoadTemplates}
              disabled={isLoading}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
            >
              Load Templates
            </button>
            <button
              onClick={testCreateFromTemplate}
              disabled={isLoading || !projectNameInput}
              className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              Create from Template
            </button>
          </div>
        </div>

        {/* Project Persistence */}
        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3 text-green-800">Project Persistence</h4>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">File Path</label>
            <input
              type="text"
              value={filePathInput}
              onChange={(e) => setFilePathInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="/tmp/my_project.json"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={testSaveProject}
              disabled={!currentProject || isLoading || !filePathInput}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              Save Project
            </button>
            <button
              onClick={testLoadProject}
              disabled={isLoading || !filePathInput}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              Load Project
            </button>
          </div>
        </div>

        {/* Project Management */}
        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-medium mb-3 text-yellow-800">Project Management</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={testValidateProject}
              disabled={!currentProject || isLoading}
              className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
            >
              Validate Project
            </button>
            <button
              onClick={testBatchOperation}
              disabled={isLoading || Object.keys(gesProjects).length === 0 || batchInProgress}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              {batchInProgress ? 'Running...' : 'Batch Validate'}
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Status Display */}
      {(Object.keys(availableTemplates).length > 0 || lastValidationResult || lastBatchResult) && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="font-semibold mb-4">Enhanced Status</h3>
          
          {/* Templates Status */}
          {Object.keys(availableTemplates).length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium mb-2 text-gray-600">Available Templates ({Object.keys(availableTemplates).length})</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(availableTemplates).map(([key, template]) => (
                  <div key={key} className="bg-white p-3 rounded border">
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-gray-500">{template.width}x{template.height} @ {template.framerate}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Results */}
          {lastValidationResult && (
            <div className="mb-4">
              <h4 className="font-medium mb-2 text-gray-600">Last Validation Result</h4>
              <div className={`p-3 rounded-lg ${lastValidationResult.project_valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                <div className="font-medium">
                  Status: {lastValidationResult.project_valid ? '✅ Valid' : '❌ Invalid'}
                </div>
                {lastValidationResult.issues_found.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium">Issues Found:</div>
                    <ul className="text-sm list-disc list-inside">
                      {lastValidationResult.issues_found.map((issue, index) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Batch Operation Results */}
          {lastBatchResult && (
            <div className="mb-4">
              <h4 className="font-medium mb-2 text-gray-600">Last Batch Operation</h4>
              <div className="bg-blue-100 text-blue-800 p-3 rounded-lg">
                <div className="font-medium">Operation: {lastBatchResult.operation}</div>
                <div className="text-sm">
                  Success Rate: {lastBatchResult.successful.length}/{lastBatchResult.total_projects} ({((lastBatchResult.successful.length / lastBatchResult.total_projects) * 100).toFixed(1)}%)
                </div>
                {lastBatchResult.failed.length > 0 && (
                  <div className="text-sm mt-1">
                    <span className="font-medium">Failed:</span> {lastBatchResult.failed.map(f => f.project_id).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Test Results */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Test Results</h3>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {testResults.length === 0 ? (
            <p className="text-gray-500 italic">No tests run yet</p>
          ) : (
            testResults.map((result, index) => (
              <div key={index} className="text-sm font-mono bg-white p-2 rounded">
                {result}
              </div>
            ))
          )}
        </div>
        
        {testResults.length > 0 && (
          <button 
            onClick={() => setTestResults([])}
            className="mt-2 px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
          >
            Clear Results
          </button>
        )}
      </div>
      
      {/* API Status */}
      <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
        <h3 className="font-semibold text-yellow-800 mb-2">Note</h3>
        <p className="text-sm text-yellow-700">
          This test component demonstrates the GES project management functionality. 
          Ensure the backend server is running at localhost:8000 for full functionality.
        </p>
      </div>
    </div>
  );
};

export default GESProjectTest; 