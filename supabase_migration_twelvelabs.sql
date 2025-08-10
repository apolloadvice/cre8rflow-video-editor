-- TwelveLabs Integration Migration
-- Run this SQL in your Supabase SQL Editor to add the required columns

-- Add TwelveLabs indexing columns to the assets table
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS indexing_status VARCHAR(20) DEFAULT 'not_started' CHECK (indexing_status IN ('not_started', 'starting', 'processing', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS twelvelabs_task_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS twelvelabs_video_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS indexing_progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS indexing_started_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS indexing_completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS indexing_error TEXT,
ADD COLUMN IF NOT EXISTS user_index_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255) DEFAULT 'user123';

-- Create index for performance on common queries
CREATE INDEX IF NOT EXISTS idx_assets_indexing_status ON assets(indexing_status);
CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_assets_user_index_id ON assets(user_index_id);

-- Update existing rows to have default user_id if they don't have one
UPDATE assets SET user_id = 'user123' WHERE user_id IS NULL;

-- Verify the migration
SELECT 
    column_name, 
    data_type, 
    is_nullable, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'assets' 
  AND column_name IN ('indexing_status', 'twelvelabs_task_id', 'twelvelabs_video_id', 'indexing_progress', 'user_id', 'user_index_id')
ORDER BY column_name;

-- Show sample of updated table structure
SELECT 
    id, 
    original_name, 
    indexing_status, 
    user_id, 
    created_at 
FROM assets 
LIMIT 5;