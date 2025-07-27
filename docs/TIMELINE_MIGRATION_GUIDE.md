# Timeline Migration Guide: Legacy to OpenTimelineIO

## 🎯 Overview

This guide documents the migration from our legacy timeline system to an **OpenTimelineIO-inspired non-destructive editing architecture**. The migration provides backward compatibility while enabling professional-grade video editing capabilities.

## 📋 Migration Benefits

### ✅ **Non-Destructive Editing**
- **Before**: Clips were modified directly, potentially losing original data
- **After**: Source media is never touched; only edit decisions are stored
- **Impact**: Users can always return to original quality, undo any operation

### ✅ **Frame-Accurate Operations**  
- **Before**: Floating-point time representation caused drift
- **After**: Integer frame counts at fixed rates (RationalTime)
- **Impact**: Perfect precision for professional editing

### ✅ **Explicit Gap Management**
- **Before**: Gaps were implicit, causing timeline inconsistencies
- **After**: Gaps are explicit objects that preserve timeline length
- **Impact**: Support for both ripple (close gap) and lift (preserve gap) operations

### ✅ **Industry Standard Architecture**
- **Before**: Custom timeline structure
- **After**: OpenTimelineIO-inspired model used by major NLEs
- **Impact**: Better interoperability, proven scalability

## 🏗️ Architecture Comparison

### Legacy Timeline Structure
```
Timeline
  ├── Track[]
      └── VideoClip[] (direct frame modification)
```

### OpenTimelineIO Structure  
```
Timeline
  ├── Track[]
      └── ComposableItem[] (Clip | Gap | Transition)
          ├── MediaReference (source file + available_range)
          └── source_range (trimmed portion)
```

## 🔧 Implementation Details

### **Phase 1: Core Data Model**

#### **RationalTime**
```python
@dataclass
class RationalTime:
    value: int      # Frame number (integer)
    rate: float     # Frame rate (e.g., 30.0)
    
    def to_seconds(self) -> float:
        return self.value / self.rate
```

#### **MediaReference** 
```python
@dataclass  
class MediaReference:
    id: str
    url: str                          # File path or network URL
    available_range: Optional[TimeRange]  # What's available in file
    metadata: Dict[str, Any]
```

#### **OTIOClip (Non-Destructive)**
```python
@dataclass
class OTIOClip(ComposableItem):
    media_reference: MediaReference
    source_range: Optional[TimeRange]  # Trimmed portion, None = use all available
```

### **Phase 2: Adapter System**

The `TimelineAdapter` provides unified interface for both formats:

```python
# Works with both legacy and OTIO timelines
adapter = TimelineAdapter(timeline)

# Unified API
clips = adapter.get_clips_for_api()  # Same format regardless of underlying type
success = adapter.cut_out_range(5.0, 10.0, mode='ripple')  # Non-destructive
fps = adapter.fps  # Consistent access
```

### **Phase 3: Command Processing**

#### **Legacy Command Flow**
```
User Command → Parser → Direct Clip Modification → Save
```

#### **New Command Flow** 
```
User Command → Parser → Non-Destructive Operation → Timeline Update → Save
```

#### **Cut Out Example**
```python
# Legacy: Modifies clip frames directly
clip.start = new_start_frame
clip.end = new_end_frame

# OTIO: Creates new clips with different source_ranges
first_clip = OTIOClip(media_ref, TimeRange(0, cut_start))
second_clip = OTIOClip(media_ref, TimeRange(cut_end, remaining))
```

## 📚 Usage Examples

### **Backend: Using Timeline Adapter**

```python
from app.timeline_adapter import TimelineAdapter, TimelineMigrationService

# Load timeline (auto-detects format)
adapter = await load_timeline_with_adapter(asset_path)

# Check format
if adapter.is_otio:
    print("Using OpenTimelineIO format")
else:
    print("Using legacy format")

# Perform operations (works with both)
success = adapter.cut_out_range(
    start_seconds=5.0,
    end_seconds=10.0, 
    mode='ripple'  # Close gap after cut
)

# Migrate if needed
if not adapter.is_otio:
    otio_adapter = adapter.migrate_to_otio()
```

### **Frontend: Using Timeline Utilities**

```typescript
import { TimelineAdapter, timelineAPI, migrationUtils } from '@/utils/timelineAdapter';

// Detect timeline format
const format = TimelineAdapter.detectFormat(timelineData);
const adapter = TimelineAdapter.fromData(timelineData);

// Get clips in consistent format
const clips = adapter.getClipsForAPI();

// Check if migration recommended
if (migrationUtils.shouldPromptMigration(timelineData)) {
    // Show migration prompt
    const message = migrationUtils.getMigrationMessage();
}

// Use enhanced API
const response = await timelineAPI.executeCommandV2({
    command: "cut out 00:05-00:10",
    asset_path: "/path/to/video.mp4",
    migration_mode: true  // Auto-migrate during operation
});
```

### **API: Command Processing v2**

```bash
# Execute command with migration support
POST /api/command/v2
{
    "command": "cut out 00:05-00:10",
    "asset_path": "/path/to/video.mp4",
    "timeline_format": "auto",
    "migration_mode": true
}

# Response includes migration info
{
    "status": "success",
    "applied": true,
    "timeline": { ... },
    "timeline_format": "otio",
    "migration_performed": true
}

# Check timeline format
GET /api/timeline/format/path/to/video.mp4

# Explicitly migrate timeline  
POST /api/timeline/migrate/path/to/video.mp4
```

## 🧪 Testing the Migration

### **Run Migration Tests**
```bash
cd backend
python test_otio_migration.py
```

### **Test Results Should Show**
```
🧪 Running OpenTimelineIO Migration Tests

=== Testing RationalTime ===
✅ RationalTime tests passed

=== Testing OTIO Timeline Creation ===
✅ OTIO timeline creation tests passed

=== Testing Legacy to OTIO Conversion ===
✅ Legacy to OTIO conversion tests passed

=== Testing Non-Destructive Cut Operations ===
✅ Non-destructive cut operation tests passed

=== Testing Timeline Adapter API ===
✅ Timeline adapter API tests passed

=== Testing Serialization Round Trip ===
✅ Serialization round trip tests passed

🎉 All tests passed! Migration system is working correctly.
```

## 📋 Migration Checklist

### **For Developers**

- [ ] **Understand Key Concepts**
  - [ ] Non-destructive editing principles  
  - [ ] RationalTime for frame-accurate operations
  - [ ] MediaReference vs source_range distinction
  - [ ] Ripple vs lift operation modes

- [ ] **Update Code**
  - [ ] Use `TimelineAdapter` for timeline operations
  - [ ] Replace direct clip modification with OTIO operations
  - [ ] Update API calls to use v2 endpoints where beneficial
  - [ ] Add migration prompts in UI where appropriate

- [ ] **Test Migration**
  - [ ] Run migration test suite
  - [ ] Test with existing projects
  - [ ] Verify command operations work with both formats
  - [ ] Check UI compatibility

### **For Users**

- [ ] **Understand Benefits** 
  - [ ] Non-destructive editing preserves original files
  - [ ] Frame-accurate operations improve precision
  - [ ] Better performance with large projects

- [ ] **Migration Process**
  - [ ] Existing projects continue to work unchanged
  - [ ] New projects automatically use enhanced format
  - [ ] Optional migration available for existing projects
  - [ ] No data loss during migration

## 🚦 Migration Phases

### **Phase 1: Foundation** ✅ **COMPLETE**
- [x] Core OTIO data model implemented
- [x] Timeline adapter system created
- [x] Basic non-destructive operations

### **Phase 2: API Integration** ✅ **COMPLETE**  
- [x] Command API v2 with dual format support
- [x] Migration endpoints
- [x] Backward compatibility maintained

### **Phase 3: Frontend Integration** ✅ **COMPLETE**
- [x] Frontend timeline utilities
- [x] Migration detection and prompts
- [x] Enhanced API client functions

### **Phase 4: Testing & Validation** ✅ **COMPLETE**
- [x] Comprehensive test suite
- [x] Migration validation
- [x] Performance benchmarking

### **Phase 5: Production Rollout** 🔄 **READY**
- [ ] Gradual feature rollout
- [ ] User migration prompts
- [ ] Analytics and monitoring
- [ ] Documentation updates

## ⚠️ Important Notes

### **Backward Compatibility**
- All existing timelines continue to work unchanged
- Legacy API endpoints remain functional
- Migration is optional and user-controlled
- No breaking changes to existing functionality

### **Performance Considerations**
- OTIO format may use slightly more storage (explicit gaps, metadata)
- Operations are faster due to non-destructive nature
- Large projects benefit significantly from new architecture

### **Data Safety**  
- Original media files are never modified
- All edit operations are reversible
- Migration process includes validation steps
- Comprehensive testing ensures data integrity

## 🔗 Related Documentation

- [OpenTimelineIO Documentation](https://opentimelineio.readthedocs.io/en/v0.14/tutorials/otio-timeline-structure.html)
- [Command Structure Documentation](../docs/command_structure.md)
- [API Reference](../docs/api_reference.md)
- [Testing Guide](../docs/testing_guide.md)

## 🆘 Troubleshooting

### **Common Issues**

**Migration fails with "Unknown timeline format"**
- Check timeline data structure
- Verify required fields are present
- Run validation tests

**Commands not working after migration**
- Ensure using v2 API endpoints
- Check timeline adapter configuration
- Verify command format compatibility

**Performance slower than expected**
- Profile timeline operations
- Check for unnecessary format conversions
- Optimize clip count and duration

### **Getting Help**

- Run diagnostic tests: `python test_otio_migration.py`
- Check logs for migration-specific messages
- Review timeline format with `/api/timeline/format/{asset_path}`
- Consult migration analytics for insights

---

## ✨ Conclusion

The migration to OpenTimelineIO-inspired architecture represents a significant upgrade to professional-grade video editing capabilities. The implementation provides:

- **Seamless transition** with full backward compatibility
- **Non-destructive editing** that preserves original media
- **Frame-accurate precision** for professional workflows  
- **Industry-standard architecture** for future extensibility

The migration system allows users to adopt the new format at their own pace while immediately benefiting from enhanced capabilities. 