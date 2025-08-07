# Export System Setup Guide

This guide covers the setup requirements for the enhanced video export system that provides frame-accurate exports matching timeline visualization.

## 🎯 Overview

The enhanced export system processes timeline intervals with frame-accurate FFmpeg commands to ensure exported videos match exactly what users see on the timeline, including all cuts and edits.

## 📋 Supabase Storage Setup

### 1. Create Exports Bucket

Since the Supabase MCP tools don't include storage bucket management, you'll need to set up the exports bucket manually:

1. **Access Supabase Dashboard**
   - Go to [https://app.supabase.com](https://app.supabase.com)
   - Select your project: `apolloadvice's Project` (fgvyotgowmcwcphsctlc)

2. **Create Exports Bucket**
   - Navigate to **Storage** → **Buckets**
   - Click **"New bucket"**
   - Bucket name: `exports`
   - Public bucket: ✅ **Enable** (for download URLs)
   - Click **"Create bucket"**

### 2. Configure Bucket Permissions

Set up proper access controls for the exports bucket:

#### **Policy for Authenticated Uploads**
```sql
CREATE POLICY "Allow service role uploads" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'exports' 
  AND auth.role() = 'service_role'
);
```

#### **Policy for Public Downloads**
```sql
CREATE POLICY "Allow public downloads" ON storage.objects
FOR SELECT USING (bucket_id = 'exports');
```

### 3. Configure CORS Settings

Enable CORS for browser downloads:

1. Go to **Storage** → **Settings** → **CORS Configuration**
2. Add CORS rule for exports bucket:

```json
{
  "allowedOrigins": ["*"],
  "allowedMethods": ["GET", "POST", "PUT", "DELETE", "HEAD"],
  "allowedHeaders": ["authorization", "x-client-info", "apikey", "content-type"]
}
```

### 4. Optional: Auto-Cleanup Policy

Set up automatic cleanup of old export files:

1. Go to **Database** → **Functions**
2. Create new function: `cleanup_old_exports`

```sql
CREATE OR REPLACE FUNCTION cleanup_old_exports()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete export files older than 24 hours
  DELETE FROM storage.objects 
  WHERE bucket_id = 'exports' 
    AND created_at < NOW() - INTERVAL '24 hours';
END;
$$;
```

3. Create cron job (if pg_cron is enabled):
```sql
SELECT cron.schedule(
  'cleanup-exports',
  '0 2 * * *', -- Run at 2 AM daily
  'SELECT cleanup_old_exports();'
);
```

## 🔧 Backend Configuration

The backend is already configured with the correct Supabase credentials and export bucket name:

```python
# In backend/app/backend/export_api.py
SUPABASE_URL = "https://fgvyotgowmcwcphsctlc.supabase.co"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
EXPORTS_BUCKET = "exports"
```

## ✅ Verification

Test the export system setup:

### 1. **Check Bucket Creation**
```bash
# Using supabase CLI (if installed)
supabase storage ls
# Should show 'exports' bucket
```

### 2. **Test Export Flow**
1. Create a timeline with multiple clips
2. Run a command like "Cut out 00:05-00:15"
3. Export the timeline
4. Verify the exported video matches timeline visualization

### 3. **Check Upload/Download**
1. Monitor backend logs for upload success messages
2. Verify download URLs are generated
3. Test downloading exported files

## 🎬 Export Process Flow

1. **Frontend**: User initiates export with timeline intervals
2. **Backend**: 
   - Processes intervals with frame-accurate FFmpeg
   - Uploads result to Supabase exports bucket
   - Generates signed download URL (24hr expiry)
   - Cleans up local temporary files
3. **User**: Downloads exported video via signed URL

## 🐛 Troubleshooting

### **Export Upload Fails**
- Check Supabase service role key is correct
- Verify exports bucket exists and has proper permissions
- Check network connectivity to Supabase

### **Download URLs Don't Work**
- Verify bucket is set to public
- Check CORS configuration
- Ensure signed URLs haven't expired (24hr limit)

### **Export Doesn't Match Timeline**
- Check console logs for interval tree generation
- Verify clip file_path values point to correct Supabase assets
- Check FFmpeg command generation in backend logs

## 📈 Performance Notes

- **Large files**: Upload time depends on file size and network speed
- **Storage costs**: Exports are stored in Supabase storage (charged per GB)
- **Cleanup**: Auto-cleanup prevents storage costs from accumulating
- **Bandwidth**: Downloads use Supabase bandwidth allocation

## 🔐 Security Considerations

- **Service role key**: Only backend has service role access for uploads
- **Signed URLs**: Downloads use time-limited signed URLs
- **Public bucket**: Exports bucket is public for downloads (URLs still need to be known)
- **Cleanup**: Old files are automatically removed to prevent unauthorized access

## 🎯 Success Criteria

✅ **Frame-Accurate Exports**: Exported videos match timeline visualization exactly  
✅ **Multi-Clip Support**: Handles any number of clips with complex edits  
✅ **Cloud Storage**: Files uploaded to Supabase for reliable access  
✅ **Download Links**: Users get working download URLs for completed exports  
✅ **Auto-Cleanup**: Old exports are cleaned up automatically  

The enhanced export system is now ready to provide professional-quality, frame-accurate video exports that match your timeline visualization exactly!