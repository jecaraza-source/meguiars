/**
 * Tipos de la base de datos. Regenerar tras cada migración con:
 *   npx supabase gen types typescript --project-id <id> > packages/core/src/supabase/database.types.ts
 * Versión inicial escrita a mano para la migración 0001_foundation.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppRole = "owner" | "admin" | "manager" | "advisor" | "technician" | "viewer";

export interface Database {
  public: {
    Tables: {
      detail_centers: {
        Row: { id: string; code: string; name: string; timezone: string; created_at: string; updated_at: string };
        Insert: { id?: string; code: string; name: string; timezone?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; code?: string; name?: string; timezone?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; full_name: string | null; created_at: string; updated_at: string };
        Insert: { id: string; full_name?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; full_name?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      center_memberships: {
        Row: { detail_center_id: string; user_id: string; role: AppRole; active: boolean; created_at: string; updated_at: string };
        Insert: { detail_center_id: string; user_id: string; role: AppRole; active?: boolean; created_at?: string; updated_at?: string };
        Update: { detail_center_id?: string; user_id?: string; role?: AppRole; active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          detail_center_id: string | null;
          table_name: string;
          record_id: string | null;
          action: "INSERT" | "UPDATE" | "DELETE";
          actor_id: string | null;
          reason: string | null;
          old_data: Json | null;
          new_data: Json | null;
          occurred_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { app_role: AppRole };
    CompositeTypes: Record<string, never>;
  };
}
