// Generado con el formato de `supabase gen types typescript` para las migraciones
// 20260922000000_foundation, 20260923000000_multicenter_security,
// 20260925000000_advisor_fixes, 20260926000000_auth_session y
// 20260927000000_clients_vehicles. Regenerar tras
// cada migración con `npm run db:types` (requiere `npm run db:start`).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          detail_center_id: string | null;
          event: string | null;
          id: number;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          organization_id: string | null;
          reason: string | null;
          record_id: string | null;
          table_name: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          detail_center_id?: string | null;
          event?: string | null;
          id?: never;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id?: string | null;
          reason?: string | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          detail_center_id?: string | null;
          event?: string | null;
          id?: never;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          organization_id?: string | null;
          reason?: string | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      client_centers: {
        Row: {
          client_id: string;
          created_at: string;
          detail_center_id: string;
          first_seen_at: string;
          last_visit_at: string | null;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          detail_center_id: string;
          first_seen_at?: string;
          last_visit_at?: string | null;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          detail_center_id?: string;
          first_seen_at?: string;
          last_visit_at?: string | null;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "client_centers_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "client_centers_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      clients: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          email: string | null;
          full_name: string;
          home_detail_center_id: string;
          id: string;
          kind: string;
          last_visit_at: string | null;
          last_visit_detail_center_id: string | null;
          marketing_channels: string[];
          marketing_opt_in: boolean;
          marketing_opt_in_at: string | null;
          marketing_opt_in_source: string | null;
          notes: string | null;
          organization_id: string;
          phone: string;
          phone_digits: string | null;
          request_id: string;
          search_name: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_in_detail_center_id: string;
          email?: string | null;
          full_name: string;
          home_detail_center_id: string;
          id?: string;
          kind?: string;
          last_visit_at?: string | null;
          last_visit_detail_center_id?: string | null;
          marketing_channels?: string[];
          marketing_opt_in?: boolean;
          marketing_opt_in_at?: string | null;
          marketing_opt_in_source?: string | null;
          notes?: string | null;
          organization_id: string;
          phone: string;
          phone_digits?: never;
          request_id: string;
          search_name?: never;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          created_in_detail_center_id?: string;
          email?: string | null;
          full_name?: string;
          home_detail_center_id?: string;
          id?: string;
          kind?: string;
          last_visit_at?: string | null;
          last_visit_detail_center_id?: string | null;
          marketing_channels?: string[];
          marketing_opt_in?: boolean;
          marketing_opt_in_at?: string | null;
          marketing_opt_in_source?: string | null;
          notes?: string | null;
          organization_id?: string;
          phone?: string;
          phone_digits?: never;
          request_id?: string;
          search_name?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_last_visit_detail_center_id_fkey";
            columns: ["last_visit_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_organization_id_created_in_detail_center_id_fkey";
            columns: ["organization_id", "created_in_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "clients_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_organization_id_home_detail_center_id_fkey";
            columns: ["organization_id", "home_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      detail_centers: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "detail_centers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          created_at: string;
          full_name: string | null;
          id: string;
          last_detail_center_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          full_name?: string | null;
          id: string;
          last_detail_center_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          last_detail_center_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_last_detail_center_id_fkey";
            columns: ["last_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["id"];
          },
        ];
      };
      role_assignments: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "role_assignments_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      user_detail_centers: {
        Row: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          detail_center_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          detail_center_id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_detail_centers_detail_center_id_fkey";
            columns: ["detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicles: {
        Row: {
          active: boolean;
          client_id: string;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          id: string;
          identifier: string | null;
          make: string;
          model: string;
          notes: string | null;
          organization_id: string;
          plate: string;
          request_id: string | null;
          updated_at: string;
          year: number;
        };
        Insert: {
          active?: boolean;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          created_in_detail_center_id: string;
          id?: string;
          identifier?: string | null;
          make: string;
          model: string;
          notes?: string | null;
          organization_id: string;
          plate: string;
          request_id?: string | null;
          updated_at?: string;
          year: number;
        };
        Update: {
          active?: boolean;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          created_in_detail_center_id?: string;
          id?: string;
          identifier?: string | null;
          make?: string;
          model?: string;
          notes?: string | null;
          organization_id?: string;
          plate?: string;
          request_id?: string | null;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "vehicles_organization_id_created_in_detail_center_id_fkey";
            columns: ["organization_id", "created_in_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_vehicle: {
        Args: {
          p_client_id: string;
          p_detail_center_id: string;
          p_identifier?: string;
          p_make: string;
          p_model: string;
          p_notes?: string;
          p_plate: string;
          p_request_id: string;
          p_year: number;
        };
        Returns: {
          active: boolean;
          client_id: string;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          id: string;
          identifier: string | null;
          make: string;
          model: string;
          notes: string | null;
          organization_id: string;
          plate: string;
          request_id: string | null;
          updated_at: string;
          year: number;
        };
        SetofOptions: {
          from: "*";
          to: "vehicles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      client_history: {
        Args: { p_client_id: string };
        Returns: {
          detail_center_id: string;
          detail_center_name: string;
          kind: string;
          occurred_at: string;
          title: string;
          vehicle_id: string | null;
        }[];
      };
      create_client: {
        Args: {
          p_detail_center_id: string;
          p_duplicate_reason?: string;
          p_email?: string;
          p_full_name: string;
          p_kind?: string;
          p_marketing_channels?: string[];
          p_notes?: string;
          p_phone: string;
          p_request_id: string;
          p_source?: string;
          p_vehicles?: Json;
        };
        Returns: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          email: string | null;
          full_name: string;
          home_detail_center_id: string;
          id: string;
          kind: string;
          last_visit_at: string | null;
          last_visit_detail_center_id: string | null;
          marketing_channels: string[];
          marketing_opt_in: boolean;
          marketing_opt_in_at: string | null;
          marketing_opt_in_source: string | null;
          notes: string | null;
          organization_id: string;
          phone: string;
          phone_digits: string | null;
          request_id: string;
          search_name: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "clients";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      find_client_matches: {
        Args: {
          p_detail_center_id: string;
          p_email?: string;
          p_exclude_client_id?: string;
          p_identifiers?: string[];
          p_phone: string;
          p_plates?: string[];
        };
        Returns: {
          client_id: string;
          display_name: string;
          home_center_name: string;
          matched_on: string[];
          phone_hint: string;
          visible: boolean;
        }[];
      };
      link_client_to_center: {
        Args: { p_client_id: string; p_detail_center_id: string; p_reason: string };
        Returns: string;
      };
      my_detail_centers: {
        Args: never;
        Returns: {
          active: boolean;
          code: string;
          corporate_roles: Database["public"]["Enums"]["app_role"][];
          id: string;
          name: string;
          organization_id: string;
          organization_name: string;
          roles: Database["public"]["Enums"]["app_role"][];
          timezone: string;
        }[];
      };
      search_clients: {
        Args: { p_detail_center_id: string; p_limit?: number; p_query: string };
        Returns: {
          email: string | null;
          full_name: string;
          home_center_name: string | null;
          home_detail_center_id: string;
          id: string;
          in_active_center: boolean;
          kind: string;
          last_visit_at: string | null;
          matched_on: string;
          phone: string;
          plates: string[];
        }[];
      };
      set_active_center: {
        Args: { p_detail_center_id: string };
        Returns: string;
      };
      set_center_membership: {
        Args: {
          p_active: boolean;
          p_detail_center_id: string;
          p_reason: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_user_id: string;
        };
        Returns: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "user_detail_centers";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_role_assignment: {
        Args: {
          p_active: boolean;
          p_organization_id: string;
          p_reason: string;
          p_role: Database["public"]["Enums"]["app_role"];
          p_user_id: string;
        };
        Returns: {
          active: boolean;
          created_at: string;
          id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
          user_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "role_assignments";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_user_disabled: {
        Args: { p_disabled: boolean; p_reason: string; p_user_id: string };
        Returns: undefined;
      };
      update_client: {
        Args: {
          p_confirm_duplicate?: boolean;
          p_email: string;
          p_full_name: string;
          p_home_detail_center_id: string;
          p_id: string;
          p_kind: string;
          p_marketing_channels: string[];
          p_notes: string;
          p_phone: string;
          p_reason: string;
          p_source: string;
        };
        Returns: {
          active: boolean;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          email: string | null;
          full_name: string;
          home_detail_center_id: string;
          id: string;
          kind: string;
          last_visit_at: string | null;
          last_visit_detail_center_id: string | null;
          marketing_channels: string[];
          marketing_opt_in: boolean;
          marketing_opt_in_at: string | null;
          marketing_opt_in_source: string | null;
          notes: string | null;
          organization_id: string;
          phone: string;
          phone_digits: string | null;
          request_id: string;
          search_name: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "clients";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_detail_center: {
        Args: { p_id: string; p_name: string; p_reason: string; p_timezone: string };
        Returns: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          timezone: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "detail_centers";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      update_vehicle: {
        Args: {
          p_active: boolean;
          p_id: string;
          p_identifier: string;
          p_make: string;
          p_model: string;
          p_notes: string;
          p_plate: string;
          p_reason: string;
          p_year: number;
        };
        Returns: {
          active: boolean;
          client_id: string;
          created_at: string;
          created_by: string | null;
          created_in_detail_center_id: string;
          id: string;
          identifier: string | null;
          make: string;
          model: string;
          notes: string | null;
          organization_id: string;
          plate: string;
          request_id: string | null;
          updated_at: string;
          year: number;
        };
        SetofOptions: {
          from: "*";
          to: "vehicles";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      app_role: "admin_socio" | "encargado" | "operador_recepcion" | "contador" | "comercial_b2b";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T];

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin_socio", "encargado", "operador_recepcion", "contador", "comercial_b2b"],
    },
  },
} as const;
