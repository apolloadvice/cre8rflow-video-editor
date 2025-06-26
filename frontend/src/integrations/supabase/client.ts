
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://fgvyotgowmcwcphsctlc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZndnlvdGdvd21jd2NwaHNjdGxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU3MzI1OTAsImV4cCI6MjA2MTMwODU5MH0.kyCcU6Rji1fNhknEwfv7wCEAK_9JAZLw9Hfxdtkr4ag";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
