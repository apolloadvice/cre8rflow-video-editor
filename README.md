# Cre8rFlow Video Editor

A modern, professional video editing application built with React, TypeScript, and Supabase. Features an advanced timeline playback system with interval tree-based clip management for seamless video editing.

## 🎬 Features

- **Advanced Timeline Playback**: Seamless clip transitions with interval tree O(log n) lookup
- **Drag & Drop Interface**: Intuitive asset management and timeline editing
- **Real-time Preview**: Synchronized video playback with timeline cursor
- **Clip Management**: Join, split, and manipulate video clips with precision
- **Asset Library**: Upload and organize video files with cloud storage
- **Responsive Design**: Modern UI with shadcn/ui components

## 🏗️ Architecture

### Timeline Playback System

The core innovation of this editor is the **interval tree-based timeline playback system**:

- **Immediate URL Preloading**: Video URLs are generated when clips are placed on timeline
- **Binary Search Optimization**: O(log n) clip lookup for any timeline position
- **Promise Deduplication**: Prevents race conditions during video loading
- **RequestAnimationFrame**: Smooth timeline progression with 60fps updates
- **Error Recovery**: Robust handling of video loading failures

### Key Components

- `useIntervalTimeline.ts` - Core timeline playback logic with interval tree
- `VideoPlayer.tsx` - Synchronized video preview component
- `Timeline.tsx` - Visual timeline interface with drag/drop
- `AssetPanel.tsx` - Asset management and upload system

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for backend services)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/apolloadvice/cre8rflow-video-editor.git
   cd cre8rflow-video-editor
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   cd frontend
   npm install
   
   # Backend
   cd ../backend
   npm install
   ```

3. **Environment Setup**
   
   Create `.env` files in both frontend and backend directories:
   
   **Frontend `.env**:**
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   
   **Backend `.env**:**
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   PORT=8000
   ```

4. **Database Setup**
   
   Run the SQL migrations in your Supabase dashboard:
   ```sql
   -- Create assets table
   CREATE TABLE assets (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     name TEXT NOT NULL,
     file_path TEXT NOT NULL,
     file_size BIGINT,
     type TEXT DEFAULT 'video',
     created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
   );
   
   -- Enable RLS
   ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
   
   -- Create storage bucket
   INSERT INTO storage.buckets (id, name, public) VALUES ('assets', 'assets', true);
   ```

5. **Start Development Servers**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend  
   cd frontend
   npm run dev
   ```

## 🎯 Usage

### Basic Workflow

1. **Upload Assets**: Drag video files into the Asset Panel
2. **Create Timeline**: Drag assets from panel to timeline
3. **Edit Clips**: Join, split, and arrange clips on timeline
4. **Preview**: Use play controls to preview your edit
5. **Export**: Generate final video output

### Timeline Controls

- **Play/Pause**: Spacebar or play button
- **Seek**: Click anywhere on timeline
- **Zoom**: Mouse wheel on timeline
- **Join Clips**: Select adjacent clips and click join
- **Split Clips**: Position cursor and use split tool

### Debug Features

- **Interval Tree Inspector**: Click settings button in video player
- **Console Logging**: Comprehensive debug output for development
- **Performance Monitoring**: Timeline update metrics

## 🛠️ Technical Details

### Interval Tree Implementation

```typescript
interface TimelineInterval {
  start: number;
  end: number;
  clip: Clip;
  videoUrl?: string;
  loaded: boolean;
}

// Binary search for clip at specific time
const findIntervalAtTime = (time: number): TimelineInterval | null => {
  return intervals.find(interval => 
    time >= interval.start && time < interval.end
  ) || null;
};
```

### Video Synchronization

```typescript
// Smooth timeline progression
const updateTimeline = useCallback(() => {
  const video = videoRef.current;
  if (!video || !playbackState.isPlaying) return;

  const newTimelineTime = playbackState.startTimelineTime + 
    (performance.now() - playbackState.startTime) / 1000;
  
  // Find and switch to appropriate interval
  const currentInterval = findIntervalAtTime(newTimelineTime);
  if (currentInterval && currentInterval !== playbackState.currentInterval) {
    switchToInterval(currentInterval, newTimelineTime);
  }
}, [/* dependencies */]);
```

### Performance Optimizations

- **Efficient Rendering**: React.memo and useMemo for expensive calculations
- **Lazy Loading**: Videos loaded only when needed
- **Debounced Updates**: Optimized timeline scrubbing
- **Memory Management**: Cleanup of unused video resources

## 🧪 Testing

```bash
# Run frontend tests
cd frontend
npm test

# Run backend tests  
cd backend
npm test

# Run integration tests
npm run test:integration
```

## 📦 Build & Deployment

```bash
# Build frontend
cd frontend
npm run build

# Build backend
cd backend  
npm run build

# Deploy (configure your hosting platform)
npm run deploy
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Use ESLint and Prettier for code formatting
- Write unit tests for new features
- Update documentation for API changes
- Follow conventional commit messages

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔧 Troubleshooting

### Common Issues

**Video not loading:**
- Check Supabase storage bucket permissions
- Verify signed URL generation
- Check browser console for errors

**Timeline playback stuttering:**
- Enable hardware acceleration in browser
- Check video encoding format compatibility
- Monitor JavaScript console for performance warnings

**Clip joining issues:**
- Ensure clips are adjacent on timeline
- Check for overlapping time ranges
- Verify clip selection state

### Debug Mode

Enable debug mode by setting `VITE_DEBUG=true` in your environment file for detailed console logging.

## 📚 Documentation

- [API Reference](docs/api.md)
- [Architecture Guide](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
- [Contributing Guide](docs/contributing.md)

## 💬 Support

- Create an [Issue](https://github.com/apolloadvice/cre8rflow-video-editor/issues) for bug reports
- Join our [Discord](https://discord.gg/cre8rflow) for community support
- Email: support@cre8rflow.com

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for backend infrastructure
- [shadcn/ui](https://ui.shadcn.com) for UI components
- [Lucide React](https://lucide.dev) for icons
- [Vite](https://vitejs.dev) for build tooling

---

**Built with ❤️ by the Cre8rFlow team**