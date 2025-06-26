
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      [_ in string]: {
        Row: {}
        Insert: {}
        Update: {}
        Relationships: []
      }
    }
    Views: {
      [_ in string]: {
        Row: {}
      }
    }
    Functions: {
      [_ in string]: {
        Args: {}
        Returns: {}
      }
    }
    Enums: {
      [_ in string]: {}
    }
  }
}
