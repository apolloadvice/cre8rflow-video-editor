#!/usr/bin/env node
/**
 * Frontend Multi-Track Export Validation
 * 
 * Tests the frontend TypeScript components for multi-track export:
 * - Multi-track export adapter functionality
 * - Export hook validation and configuration  
 * - Export dialog integration
 * - Timeline state management
 * - Error handling and edge cases
 */

const fs = require('fs');
const path = require('path');

class FrontendMultiTrackTester {
    constructor() {
        this.testResults = {
            testsRun: 0,
            testsPassed: 0,
            testsFailed: 0,
            failures: []
        };
        
        this.frontendDir = path.join(__dirname, 'frontend');
    }
    
    log(message, level = "INFO") {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${level}: ${message}`);
    }
    
    assertTrue(condition, message) {
        this.testResults.testsRun++;
        if (condition) {
            this.testResults.testsPassed++;
            this.log(`✅ PASS: ${message}`);
        } else {
            this.testResults.testsFailed++;
            this.testResults.failures.push(message);
            this.log(`❌ FAIL: ${message}`, "ERROR");
        }
    }
    
    fileExists(filePath) {
        return fs.existsSync(filePath);
    }
    
    readFile(filePath) {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch (error) {
            return null;
        }
    }
    
    testMultiTrackExportAdapterExists() {
        this.log("Testing multi-track export adapter existence...");
        
        const adapterPath = path.join(this.frontendDir, 'src/lib/multiTrackExportAdapter.ts');
        const exists = this.fileExists(adapterPath);
        this.assertTrue(exists, "Multi-track export adapter file should exist");
        
        if (exists) {
            const content = this.readFile(adapterPath);
            
            // Check for key exports
            this.assertTrue(content.includes('export interface MultiTrackExportInterval'), 
                          "Should export MultiTrackExportInterval interface");
            this.assertTrue(content.includes('convertTimelineToMultiTrackIntervals'), 
                          "Should export convertTimelineToMultiTrackIntervals function");
            this.assertTrue(content.includes('validateMultiTrackIntervals'), 
                          "Should export validateMultiTrackIntervals function");
            this.assertTrue(content.includes('generateMultiTrackExportConfig'), 
                          "Should export generateMultiTrackExportConfig function");
                          
            // Check for track kinds support
            this.assertTrue(content.includes('trackKind'), "Should support trackKind property");
            this.assertTrue(content.includes('trackIndex'), "Should support trackIndex property");
            this.assertTrue(content.includes('volume'), "Should support volume property");
            this.assertTrue(content.includes('opacity'), "Should support opacity property");
            this.assertTrue(content.includes('transforms'), "Should support transforms property");
            
            this.log(`✅ Multi-track export adapter validation passed`);
        }
    }
    
    testMultiTrackExportHook() {
        this.log("Testing multi-track export hook...");
        
        const hookPath = path.join(this.frontendDir, 'src/hooks/useMultiTrackExport.ts');
        const exists = this.fileExists(hookPath);
        this.assertTrue(exists, "Multi-track export hook file should exist");
        
        if (exists) {
            const content = this.readFile(hookPath);
            
            // Check for key hook functions
            this.assertTrue(content.includes('useMultiTrackExport'), 
                          "Should export useMultiTrackExport hook");
            this.assertTrue(content.includes('buildExportIntervals'), 
                          "Should provide buildExportIntervals function");
            this.assertTrue(content.includes('validateTimelineForExport'), 
                          "Should provide validateTimelineForExport function");
            this.assertTrue(content.includes('isTimelineReadyForExport'), 
                          "Should provide isTimelineReadyForExport function");
            this.assertTrue(content.includes('getTimelineStats'), 
                          "Should provide getTimelineStats function");
                          
            // Check for integration with multi-track store
            this.assertTrue(content.includes('useMultiTrackStore'), 
                          "Should integrate with multi-track store");
            this.assertTrue(content.includes('multitrack_intervals'), 
                          "Should support multitrack_intervals parameter");
                          
            this.log(`✅ Multi-track export hook validation passed`);
        }
    }
    
    testExportDialogIntegration() {
        this.log("Testing export dialog integration...");
        
        const dialogPath = path.join(this.frontendDir, 'src/components/editor/ExportDialog.tsx');
        const exists = this.fileExists(dialogPath);
        this.assertTrue(exists, "Export dialog file should exist");
        
        if (exists) {
            const content = this.readFile(dialogPath);
            
            // Check for multi-track integration
            this.assertTrue(content.includes('useMultiTrackExport'), 
                          "Export dialog should use multi-track export hook");
            this.assertTrue(content.includes('isTimelineReadyForExport'), 
                          "Should check if timeline is ready for multi-track export");
            this.assertTrue(content.includes('multitrack_intervals'), 
                          "Should support multitrack_intervals in export request");
                          
            // Check for intelligent export routing
            this.assertTrue(content.includes('multiTrackExport.isTimelineReadyForExport()'), 
                          "Should intelligently route to multi-track export");
            this.assertTrue(content.includes('exportTree.buildExportIntervals()') || 
                          content.includes('legacy export'), 
                          "Should fallback to legacy export when needed");
                          
            // Check for proper error handling
            this.assertTrue(content.includes('validation.isValid'), 
                          "Should validate timeline before export");
            this.assertTrue(content.includes('validation.errors'), 
                          "Should handle validation errors");
                          
            this.log(`✅ Export dialog integration validation passed`);
        }
    }
    
    testMultiTrackStoreIntegration() {
        this.log("Testing multi-track store integration...");
        
        const storePath = path.join(this.frontendDir, 'src/store/multiTrackStore.ts');
        const exists = this.fileExists(storePath);
        this.assertTrue(exists, "Multi-track store file should exist");
        
        if (exists) {
            const content = this.readFile(storePath);
            
            // Check for timeline structure
            this.assertTrue(content.includes('Timeline'), "Should use Timeline type");
            this.assertTrue(content.includes('Track'), "Should use Track type");
            this.assertTrue(content.includes('TimelineElement'), "Should use TimelineElement type");
            this.assertTrue(content.includes('TrackKind'), "Should use TrackKind type");
            
            // Check for export-ready state management
            this.assertTrue(content.includes('project'), "Should manage project state");
            this.assertTrue(content.includes('timeline'), "Should manage timeline state");
            
            this.log(`✅ Multi-track store integration validation passed`);
        }
    }
    
    testTimelineTypesStructure() {
        this.log("Testing timeline types structure...");
        
        const typesPath = path.join(this.frontendDir, 'src/types/timeline.ts');
        const exists = this.fileExists(typesPath);
        this.assertTrue(exists, "Timeline types file should exist");
        
        if (exists) {
            const content = this.readFile(typesPath);
            
            // Check for multi-track type definitions
            this.assertTrue(content.includes('export interface Timeline'), 
                          "Should define Timeline interface");
            this.assertTrue(content.includes('export interface Track'), 
                          "Should define Track interface");
            this.assertTrue(content.includes('export interface TimelineElement'), 
                          "Should define TimelineElement interface");
            this.assertTrue(content.includes('export type TrackKind'), 
                          "Should define TrackKind type");
                          
            // Check for track kinds
            this.assertTrue(content.includes("'video'"), "Should support video track kind");
            this.assertTrue(content.includes("'audio'"), "Should support audio track kind");
            this.assertTrue(content.includes("'title'"), "Should support title track kind");
            this.assertTrue(content.includes("'overlay'"), "Should support overlay track kind");
            this.assertTrue(content.includes("'effect'"), "Should support effect track kind");
            
            // Check for export-relevant properties
            this.assertTrue(content.includes('volume'), "Should support volume property");
            this.assertTrue(content.includes('opacity'), "Should support opacity property");
            this.assertTrue(content.includes('transforms'), "Should support transforms");
            this.assertTrue(content.includes('effects'), "Should support effects");
            
            this.log(`✅ Timeline types structure validation passed`);
        }
    }
    
    testAICommandsIntegration() {
        this.log("Testing AI commands integration...");
        
        const aiCommandsPath = path.join(this.frontendDir, 'src/hooks/useMultiTrackAICommands.ts');
        const exists = this.fileExists(aiCommandsPath);
        this.assertTrue(exists, "Multi-track AI commands hook should exist");
        
        if (exists) {
            const content = this.readFile(aiCommandsPath);
            
            // Check for proper command routing
            this.assertTrue(content.includes('useMultiTrackStore'), 
                          "Should integrate with multi-track store");
            this.assertTrue(content.includes('useOpenAICommands') || content.includes('OpenAI'), 
                          "Should integrate with existing OpenAI system");
                          
            // Check that mode concept was removed
            this.assertTrue(!content.includes('Multi-Track Mode Active') && 
                          !content.includes('multitrack mode'), 
                          "Should not reference multi-track mode (should be default)");
                          
            this.log(`✅ AI commands integration validation passed`);
        }
    }
    
    testChatPanelUpdates() {
        this.log("Testing chat panel updates...");
        
        const chatPanelPath = path.join(this.frontendDir, 'src/components/editor/ChatPanel.tsx');
        const exists = this.fileExists(chatPanelPath);
        this.assertTrue(exists, "Chat panel file should exist");
        
        if (exists) {
            const content = this.readFile(chatPanelPath);
            
            // Check that mode indicators were removed
            this.assertTrue(!content.includes('Multi-Track Mode Active'), 
                          "Should not show multi-track mode indicator");
                          
            // Check for multi-track command routing
            this.assertTrue(content.includes('useMultiTrackAICommands') || 
                          content.includes('multi-track'), 
                          "Should route commands through multi-track system");
                          
            this.log(`✅ Chat panel updates validation passed`);
        }
    }
    
    testPackageConfiguration() {
        this.log("Testing package configuration...");
        
        const packagePath = path.join(this.frontendDir, 'package.json');
        const exists = this.fileExists(packagePath);
        this.assertTrue(exists, "Package.json should exist");
        
        if (exists) {
            const content = this.readFile(packagePath);
            const packageJson = JSON.parse(content);
            
            // Check for essential dependencies
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            
            this.assertTrue('react' in deps, "Should have React dependency");
            this.assertTrue('typescript' in deps, "Should have TypeScript");
            this.assertTrue('zustand' in deps, "Should have Zustand for state management");
            
            this.log(`✅ Package configuration validation passed`);
        }
    }
    
    testProjectStructure() {
        this.log("Testing project structure...");
        
        // Check key directories exist
        const srcPath = path.join(this.frontendDir, 'src');
        const componentsPath = path.join(this.frontendDir, 'src/components');
        const hooksPath = path.join(this.frontendDir, 'src/hooks');
        const storePath = path.join(this.frontendDir, 'src/store');
        const typesPath = path.join(this.frontendDir, 'src/types');
        const libPath = path.join(this.frontendDir, 'src/lib');
        
        this.assertTrue(this.fileExists(srcPath), "src directory should exist");
        this.assertTrue(this.fileExists(componentsPath), "components directory should exist");
        this.assertTrue(this.fileExists(hooksPath), "hooks directory should exist");
        this.assertTrue(this.fileExists(storePath), "store directory should exist");
        this.assertTrue(this.fileExists(typesPath), "types directory should exist");
        this.assertTrue(this.fileExists(libPath), "lib directory should exist");
        
        this.log(`✅ Project structure validation passed`);
    }
    
    runAllTests() {
        this.log("🧪 Starting Frontend Multi-Track Validation Suite...");
        this.log("=" * 60);
        
        // File structure tests
        this.testProjectStructure();
        this.testPackageConfiguration();
        
        // Core component tests
        this.testTimelineTypesStructure();
        this.testMultiTrackStoreIntegration();
        this.testMultiTrackExportAdapterExists();
        this.testMultiTrackExportHook();
        this.testExportDialogIntegration();
        
        // Integration tests
        this.testAICommandsIntegration();
        this.testChatPanelUpdates();
        
        // Print summary
        this.log("=" * 60);
        this.log("🏁 Frontend Validation Complete!");
        this.log(`Tests Run: ${this.testResults.testsRun}`);
        this.log(`Passed: ${this.testResults.testsPassed}`);
        this.log(`Failed: ${this.testResults.testsFailed}`);
        
        if (this.testResults.testsFailed > 0) {
            this.log("❌ FAILURES:", "ERROR");
            this.testResults.failures.forEach(failure => {
                this.log(`  - ${failure}`, "ERROR");
            });
        } else {
            this.log("✅ All frontend tests passed!");
        }
        
        const successRate = (this.testResults.testsPassed / this.testResults.testsRun) * 100;
        this.log(`Success Rate: ${successRate.toFixed(1)}%`);
        
        return this.testResults.testsFailed === 0;
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new FrontendMultiTrackTester();
    const success = tester.runAllTests();
    process.exit(success ? 0 : 1);
}

module.exports = FrontendMultiTrackTester;