"""
FFmpeg Performance Optimizer and Error Handler

Advanced performance monitoring and error handling utilities for multi-track export:
- Export performance benchmarking and optimization
- Comprehensive error analysis and recovery  
- Resource usage monitoring
- Export quality validation
"""

import time
import os
import subprocess
import json
from typing import Dict, List, Optional, Tuple
import psutil
from pathlib import Path

class MultiTrackExportOptimizer:
    """Performance optimizer for multi-track exports"""
    
    def __init__(self):
        self.performance_metrics = {
            'total_time': 0,
            'download_time': 0,
            'detection_time': 0,
            'processing_time': 0,
            'intervals_processed': 0,
            'files_downloaded': 0,
            'output_size_mb': 0,
            'peak_memory_mb': 0,
            'cpu_usage_percent': 0
        }
        
    def validate_multitrack_intervals(self, intervals: List[Dict]) -> Tuple[bool, List[str]]:
        """
        Comprehensive validation of multitrack intervals
        
        Args:
            intervals: List of multitrack interval dictionaries
            
        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []
        
        if not intervals:
            errors.append("No intervals provided for export")
            return False, errors
            
        # Required fields for each interval
        required_fields = [
            'sourceFile', 'sourceDuration', 'timelineStart', 
            'trackKind', 'clipId', 'clipName'
        ]
        
        valid_track_kinds = ['video', 'audio', 'title', 'overlay', 'effect']
        
        for i, interval in enumerate(intervals):
            # Check required fields
            for field in required_fields:
                if field not in interval or interval[field] is None:
                    errors.append(f"Interval {i} missing required field: {field}")
            
            # Validate track kind
            if 'trackKind' in interval and interval['trackKind'] not in valid_track_kinds:
                errors.append(f"Interval {i} has invalid trackKind: {interval['trackKind']}")
            
            # Validate timing
            if 'sourceDuration' in interval and interval['sourceDuration'] <= 0:
                errors.append(f"Interval {i} has invalid sourceDuration: {interval['sourceDuration']}")
                
            if 'timelineStart' in interval and interval['timelineStart'] < 0:
                errors.append(f"Interval {i} has invalid timelineStart: {interval['timelineStart']}")
            
            # Validate volume and opacity ranges
            if 'volume' in interval:
                vol = interval['volume']
                if vol < 0 or vol > 5.0:  # Allow up to 5x amplification
                    errors.append(f"Interval {i} has invalid volume: {vol} (should be 0-5.0)")
                    
            if 'opacity' in interval:
                opacity = interval['opacity']
                if opacity < 0 or opacity > 1.0:
                    errors.append(f"Interval {i} has invalid opacity: {opacity} (should be 0-1.0)")
        
        # Check for overlapping intervals on same track
        track_intervals = {}
        for interval in intervals:
            track_key = f"{interval.get('trackKind', 'unknown')}_{interval.get('trackIndex', 0)}"
            if track_key not in track_intervals:
                track_intervals[track_key] = []
            track_intervals[track_key].append(interval)
        
        # Validate no overlaps within each track
        for track_key, track_content in track_intervals.items():
            sorted_intervals = sorted(track_content, key=lambda x: x.get('timelineStart', 0))
            for i in range(len(sorted_intervals) - 1):
                current = sorted_intervals[i]
                next_interval = sorted_intervals[i + 1]
                current_end = current.get('timelineStart', 0) + current.get('sourceDuration', 0)
                next_start = next_interval.get('timelineStart', 0)
                
                if current_end > next_start:
                    errors.append(f"Overlapping intervals detected on track {track_key}")
        
        return len(errors) == 0, errors
    
    def analyze_export_complexity(self, intervals: List[Dict]) -> Dict:
        """
        Analyze export complexity to predict performance requirements
        
        Args:
            intervals: List of multitrack intervals
            
        Returns:
            Dictionary with complexity analysis
        """
        analysis = {
            'total_intervals': len(intervals),
            'track_counts': {},
            'total_duration': 0,
            'max_concurrent_tracks': 0,
            'has_transforms': False,
            'has_effects': False,
            'complexity_score': 0,
            'estimated_processing_time': 0
        }
        
        # Count tracks by kind
        track_kinds = {}
        for interval in intervals:
            track_kind = interval.get('trackKind', 'unknown')
            track_kinds[track_kind] = track_kinds.get(track_kind, 0) + 1
            
            # Check for complex features
            if interval.get('transforms'):
                analysis['has_transforms'] = True
            if interval.get('effects'):
                analysis['has_effects'] = True
            
            # Calculate total duration
            end_time = interval.get('timelineStart', 0) + interval.get('sourceDuration', 0)
            analysis['total_duration'] = max(analysis['total_duration'], end_time)
        
        analysis['track_counts'] = track_kinds
        
        # Calculate complexity score
        base_score = len(intervals)
        if analysis['has_transforms']:
            base_score *= 1.5
        if analysis['has_effects']:
            base_score *= 1.3
        if track_kinds.get('video', 0) > 1:
            base_score *= 1.4  # Multiple video tracks are expensive
        
        analysis['complexity_score'] = base_score
        
        # Estimate processing time (rough heuristic)
        analysis['estimated_processing_time'] = max(
            30,  # Minimum 30 seconds
            analysis['total_duration'] * (1 + analysis['complexity_score'] / 100)
        )
        
        return analysis
    
    def monitor_system_resources(self) -> Dict:
        """Monitor system resources during export"""
        try:
            memory = psutil.virtual_memory()
            cpu_percent = psutil.cpu_percent(interval=1)
            
            return {
                'memory_total_gb': memory.total / (1024**3),
                'memory_available_gb': memory.available / (1024**3),
                'memory_used_percent': memory.percent,
                'cpu_usage_percent': cpu_percent,
                'cpu_count': psutil.cpu_count()
            }
        except Exception as e:
            print(f"⚠️ Could not monitor system resources: {e}")
            return {}
    
    def validate_output_quality(self, output_path: str, expected_duration: float = None) -> Dict:
        """
        Validate the quality and integrity of exported video
        
        Args:
            output_path: Path to the exported video file
            expected_duration: Expected duration in seconds (optional)
            
        Returns:
            Dictionary with validation results
        """
        validation = {
            'file_exists': False,
            'file_size_mb': 0,
            'has_video': False,
            'has_audio': False,
            'duration_seconds': 0,
            'resolution': None,
            'framerate': None,
            'is_valid': False,
            'errors': []
        }
        
        try:
            if not os.path.exists(output_path):
                validation['errors'].append("Output file does not exist")
                return validation
            
            validation['file_exists'] = True
            validation['file_size_mb'] = os.path.getsize(output_path) / (1024 * 1024)
            
            if validation['file_size_mb'] < 0.1:  # Less than 100KB is suspicious
                validation['errors'].append("Output file is suspiciously small")
            
            # Use ffprobe to validate video content
            probe_cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', output_path
            ]
            
            result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                probe_data = json.loads(result.stdout)
                
                # Check streams
                for stream in probe_data.get('streams', []):
                    if stream['codec_type'] == 'video':
                        validation['has_video'] = True
                        validation['resolution'] = f"{stream.get('width', 0)}x{stream.get('height', 0)}"
                        validation['framerate'] = stream.get('r_frame_rate', 'unknown')
                    elif stream['codec_type'] == 'audio':
                        validation['has_audio'] = True
                
                # Check duration
                format_info = probe_data.get('format', {})
                duration = float(format_info.get('duration', 0))
                validation['duration_seconds'] = duration
                
                # Validate duration if expected
                if expected_duration and abs(duration - expected_duration) > 2.0:
                    validation['errors'].append(f"Duration mismatch: expected {expected_duration}s, got {duration}s")
                
                validation['is_valid'] = validation['has_video'] and len(validation['errors']) == 0
                
            else:
                validation['errors'].append("Could not probe output file with ffprobe")
                
        except subprocess.TimeoutExpired:
            validation['errors'].append("Output validation timed out")
        except json.JSONDecodeError:
            validation['errors'].append("Invalid ffprobe output")
        except Exception as e:
            validation['errors'].append(f"Validation error: {str(e)}")
        
        return validation
    
    def optimize_ffmpeg_command(self, base_cmd: List[str], complexity_analysis: Dict) -> List[str]:
        """
        Optimize FFmpeg command based on complexity analysis and system resources
        
        Args:
            base_cmd: Base FFmpeg command
            complexity_analysis: Output from analyze_export_complexity
            
        Returns:
            Optimized FFmpeg command
        """
        optimized_cmd = base_cmd.copy()
        
        # Get system info
        system_info = self.monitor_system_resources()
        cpu_count = system_info.get('cpu_count', 4)
        available_memory_gb = system_info.get('memory_available_gb', 4)
        
        # Add threading optimization
        if '-threads' not in optimized_cmd:
            # Use 75% of available CPU cores for encoding
            thread_count = max(1, int(cpu_count * 0.75))
            optimized_cmd.extend(['-threads', str(thread_count)])
        
        # Memory optimization for large exports
        if complexity_analysis['complexity_score'] > 50 or available_memory_gb < 4:
            # Use more conservative settings for complex exports or low memory
            if '-preset' not in optimized_cmd:
                optimized_cmd.extend(['-preset', 'medium'])  # Balance speed vs efficiency
        else:
            # Use faster preset for simple exports with plenty of memory
            if '-preset' not in optimized_cmd:
                optimized_cmd.extend(['-preset', 'fast'])
        
        # Add progress monitoring
        if '-progress' not in optimized_cmd:
            optimized_cmd.extend(['-progress', 'pipe:1'])
        
        # Optimize for multiple video tracks
        if complexity_analysis['track_counts'].get('video', 0) > 1:
            # Add frame dropping prevention for complex compositions
            if '-avoid_negative_ts' not in optimized_cmd:
                optimized_cmd.extend(['-avoid_negative_ts', 'make_zero'])
        
        return optimized_cmd
    
    def start_performance_monitoring(self):
        """Start performance monitoring for export"""
        self.performance_metrics = {
            'total_time': time.time(),
            'download_time': 0,
            'detection_time': 0,
            'processing_time': 0,
            'intervals_processed': 0,
            'files_downloaded': 0,
            'output_size_mb': 0,
            'peak_memory_mb': 0,
            'cpu_usage_percent': 0
        }
        
    def record_performance_metric(self, metric: str, value: float):
        """Record a performance metric"""
        if metric in self.performance_metrics:
            self.performance_metrics[metric] = value
    
    def finish_performance_monitoring(self, output_path: str = None) -> Dict:
        """Finish performance monitoring and return summary"""
        total_time = time.time() - self.performance_metrics['total_time']
        self.performance_metrics['total_time'] = total_time
        
        if output_path and os.path.exists(output_path):
            self.performance_metrics['output_size_mb'] = os.path.getsize(output_path) / (1024 * 1024)
        
        # Calculate efficiency metrics
        efficiency = {
            'intervals_per_second': self.performance_metrics['intervals_processed'] / max(total_time, 1),
            'mb_per_second': self.performance_metrics['output_size_mb'] / max(total_time, 1),
            'processing_efficiency': (self.performance_metrics['processing_time'] / max(total_time, 1)) * 100
        }
        
        return {
            'performance_metrics': self.performance_metrics,
            'efficiency': efficiency,
            'summary': {
                'total_time': f"{total_time:.2f}s",
                'output_size': f"{self.performance_metrics['output_size_mb']:.1f} MB",
                'efficiency_score': f"{efficiency['processing_efficiency']:.1f}%"
            }
        }

class ExportErrorAnalyzer:
    """Analyze and categorize export errors for better debugging"""
    
    ERROR_CATEGORIES = {
        'file_not_found': [
            'no such file', 'does not exist', 'cannot open', 'not found'
        ],
        'codec_error': [
            'invalid codec', 'unsupported codec', 'codec not found', 'decoder not found'
        ],
        'format_error': [
            'invalid format', 'unknown format', 'format not supported'
        ],
        'memory_error': [
            'memory', 'allocation failed', 'out of memory', 'cannot allocate'
        ],
        'permission_error': [
            'permission denied', 'access denied', 'cannot write'
        ],
        'filter_error': [
            'filter', 'filtergraph', 'invalid filter', 'filter not found'
        ],
        'stream_error': [
            'stream', 'no video', 'no audio', 'stream not found'
        ]
    }
    
    @classmethod
    def analyze_error(cls, error_message: str) -> Dict:
        """
        Analyze FFmpeg error message and provide categorization and suggestions
        
        Args:
            error_message: FFmpeg error output
            
        Returns:
            Dictionary with error analysis and suggestions
        """
        error_lower = error_message.lower()
        
        analysis = {
            'category': 'unknown',
            'severity': 'medium',
            'suggestions': [],
            'technical_details': error_message
        }
        
        # Categorize error
        for category, keywords in cls.ERROR_CATEGORIES.items():
            if any(keyword in error_lower for keyword in keywords):
                analysis['category'] = category
                break
        
        # Provide specific suggestions based on category
        if analysis['category'] == 'file_not_found':
            analysis['severity'] = 'high'
            analysis['suggestions'] = [
                "Check that all source files are accessible",
                "Verify file URLs are valid and files exist",
                "Ensure sufficient permissions to read source files"
            ]
            
        elif analysis['category'] == 'codec_error':
            analysis['severity'] = 'high'
            analysis['suggestions'] = [
                "Verify source files are not corrupted",
                "Check if FFmpeg supports the source file formats",
                "Try re-encoding source files to standard formats (MP4, MP3)"
            ]
            
        elif analysis['category'] == 'memory_error':
            analysis['severity'] = 'high'
            analysis['suggestions'] = [
                "Reduce video resolution or quality settings",
                "Process fewer tracks simultaneously",
                "Ensure sufficient system memory is available",
                "Try breaking export into smaller segments"
            ]
            
        elif analysis['category'] == 'filter_error':
            analysis['severity'] = 'medium'
            analysis['suggestions'] = [
                "Simplify video transforms and effects",
                "Check for invalid transform coordinates",
                "Verify opacity and volume values are in valid ranges"
            ]
            
        elif analysis['category'] == 'permission_error':
            analysis['severity'] = 'high'
            analysis['suggestions'] = [
                "Check write permissions for output directory",
                "Ensure output path is accessible",
                "Try exporting to a different location"
            ]
            
        else:
            analysis['suggestions'] = [
                "Check FFmpeg installation and version",
                "Verify all input parameters are valid",
                "Try with simpler export settings"
            ]
        
        return analysis