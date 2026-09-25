// Generado con el formato de `supabase gen types typescript` para las migraciones
// 20260922000000_foundation, 20260923000000_multicenter_security,
// 20260925000000_advisor_fixes, 20260926000000_auth_session,
// 20260927000000_clients_vehicles, 20260928000000_service_catalog y
// 20260929000000_agenda. Regenerar tras
// cada migración con `npm run db:types` (requiere `npm run db:start`).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      appointment_services: {
        Row: {
          appointment_id: string;
          created_at: string;
          duration_minutes: number;
          organization_id: string;
          position: number;
          service_id: string;
        };
        Insert: {
          appointment_id: string;
          created_at?: string;
          duration_minutes: number;
          organization_id: string;
          position?: number;
          service_id: string;
        };
        Update: {
          appointment_id?: string;
          created_at?: string;
          duration_minutes?: number;
          organization_id?: string;
          position?: number;
          service_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_services_organization_id_appointment_id_fkey";
            columns: ["organization_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointment_services_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      appointments: {
        Row: {
          bay_id: string | null;
          cancelled_at: string | null;
          client_id: string;
          conflict_override: boolean;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          duration_minutes: number;
          ends_at: string;
          finished_at: string | null;
          id: string;
          is_walk_in: boolean;
          notes: string | null;
          organization_id: string;
          received_at: string | null;
          request_id: string;
          service_order_id: string | null;
          started_at: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          bay_id?: string | null;
          cancelled_at?: string | null;
          client_id: string;
          conflict_override?: boolean;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          detail_center_id: string;
          duration_minutes: number;
          ends_at: string;
          finished_at?: string | null;
          id?: string;
          is_walk_in?: boolean;
          notes?: string | null;
          organization_id: string;
          received_at?: string | null;
          request_id: string;
          service_order_id?: string | null;
          started_at?: string | null;
          starts_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          bay_id?: string | null;
          cancelled_at?: string | null;
          client_id?: string;
          conflict_override?: boolean;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          detail_center_id?: string;
          duration_minutes?: number;
          ends_at?: string;
          finished_at?: string | null;
          id?: string;
          is_walk_in?: boolean;
          notes?: string | null;
          organization_id?: string;
          received_at?: string | null;
          request_id?: string;
          service_order_id?: string | null;
          started_at?: string | null;
          starts_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          technician_id?: string | null;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_detail_center_id_bay_id_fkey";
            columns: ["detail_center_id", "bay_id"];
            isOneToOne: false;
            referencedRelation: "bays";
            referencedColumns: ["detail_center_id", "id"];
          },
          {
            foreignKeyName: "appointments_detail_center_id_technician_id_fkey";
            columns: ["detail_center_id", "technician_id"];
            isOneToOne: false;
            referencedRelation: "technicians";
            referencedColumns: ["detail_center_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "appointments_organization_id_vehicle_id_fkey";
            columns: ["organization_id", "vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
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
      bays: {
        Row: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          detail_center_id: string;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          detail_center_id?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bays_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
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
      service_center_config: {
        Row: {
          available: boolean;
          created_at: string;
          detail_center_id: string;
          direct_cost_override: number | null;
          id: string;
          organization_id: string;
          price_override: number | null;
          service_id: string;
          updated_at: string;
        };
        Insert: {
          available?: boolean;
          created_at?: string;
          detail_center_id: string;
          direct_cost_override?: number | null;
          id?: string;
          organization_id: string;
          price_override?: number | null;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          available?: boolean;
          created_at?: string;
          detail_center_id?: string;
          direct_cost_override?: number | null;
          id?: string;
          organization_id?: string;
          price_override?: number | null;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_center_config_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_center_config_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      service_price_history: {
        Row: {
          changed_by: string | null;
          detail_center_id: string | null;
          direct_cost: number | null;
          id: number;
          organization_id: string;
          price: number | null;
          reason: string | null;
          service_id: string;
          valid_from: string;
        };
        Insert: {
          changed_by?: string | null;
          detail_center_id?: string | null;
          direct_cost?: number | null;
          id?: never;
          organization_id: string;
          price?: number | null;
          reason?: string | null;
          service_id: string;
          valid_from?: string;
        };
        Update: {
          changed_by?: string | null;
          detail_center_id?: string | null;
          direct_cost?: number | null;
          id?: never;
          organization_id?: string;
          price?: number | null;
          reason?: string | null;
          service_id?: string;
          valid_from?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_price_history_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_price_history_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          base_price: number;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost: number;
          standard_duration_minutes: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          base_price: number;
          code: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost: number;
          standard_duration_minutes: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          base_price?: number;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          revenue_engine?: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost?: number;
          standard_duration_minutes?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      technicians: {
        Row: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          full_name: string;
          id: string;
          organization_id: string;
          profile_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          detail_center_id: string;
          full_name: string;
          id?: string;
          organization_id: string;
          profile_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          detail_center_id?: string;
          full_name?: string;
          id?: string;
          organization_id?: string;
          profile_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technicians_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "technicians_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      appointment_order_draft: {
        Args: { p_appointment_id: string };
        Returns: {
          appointment_id: string;
          client_id: string;
          detail_center_id: string;
          duration_minutes: number;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          service_code: string;
          service_id: string;
          service_name: string;
          unit_direct_cost: number;
          unit_price: number;
          vehicle_id: string;
        }[];
      };
      center_catalog: {
        Args: {
          p_detail_center_id: string;
          p_include_inactive?: boolean;
          p_revenue_engine?: Database["public"]["Enums"]["revenue_engine"];
        };
        Returns: {
          active: boolean;
          available: boolean;
          base_price: number;
          code: string;
          description: string | null;
          direct_cost: number;
          id: string;
          name: string;
          price: number;
          price_source: string;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost: number;
          standard_duration_minutes: number;
        }[];
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
      create_appointment: {
        Args: {
          p_bay_id?: string;
          p_client_id: string;
          p_detail_center_id: string;
          p_duration_minutes?: number;
          p_notes?: string;
          p_override_reason?: string;
          p_request_id: string;
          p_service_ids: string[];
          p_starts_at: string | null;
          p_technician_id?: string;
          p_vehicle_id: string;
          p_walk_in?: boolean;
        };
        Returns: {
          bay_id: string | null;
          cancelled_at: string | null;
          client_id: string;
          conflict_override: boolean;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          duration_minutes: number;
          ends_at: string;
          finished_at: string | null;
          id: string;
          is_walk_in: boolean;
          notes: string | null;
          organization_id: string;
          received_at: string | null;
          request_id: string;
          service_order_id: string | null;
          started_at: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      create_service: {
        Args: {
          p_base_price: number;
          p_code: string;
          p_description: string;
          p_name: string;
          p_organization_id: string;
          p_reason?: string;
          p_revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          p_standard_direct_cost: number;
          p_standard_duration_minutes: number;
        };
        Returns: {
          active: boolean;
          base_price: number;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost: number;
          standard_duration_minutes: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "services";
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
      list_appointments: {
        Args: {
          p_bay_id?: string;
          p_day: string;
          p_detail_center_id: string;
          p_status?: Database["public"]["Enums"]["appointment_status"];
          p_technician_id?: string;
        };
        Returns: {
          bay_id: string | null;
          bay_name: string | null;
          client_id: string;
          client_name: string | null;
          client_phone: string | null;
          conflict_override: boolean;
          duration_minutes: number;
          ends_at: string;
          id: string;
          is_walk_in: boolean;
          notes: string | null;
          service_order_id: string | null;
          services: string[];
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          technician_id: string | null;
          technician_name: string | null;
          vehicle_id: string;
          vehicle_label: string | null;
        }[];
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
      service_price_at: {
        Args: { p_at?: string; p_detail_center_id: string; p_service_id: string };
        Returns: {
          direct_cost: number;
          price: number;
          source: string;
        }[];
      };
      set_active_center: {
        Args: { p_detail_center_id: string };
        Returns: string;
      };
      set_appointment_status: {
        Args: { p_id: string; p_reason?: string; p_status: Database["public"]["Enums"]["appointment_status"] };
        Returns: {
          bay_id: string | null;
          cancelled_at: string | null;
          client_id: string;
          conflict_override: boolean;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          duration_minutes: number;
          ends_at: string;
          finished_at: string | null;
          id: string;
          is_walk_in: boolean;
          notes: string | null;
          organization_id: string;
          received_at: string | null;
          request_id: string;
          service_order_id: string | null;
          started_at: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      set_service_center_config: {
        Args: {
          p_available: boolean;
          p_detail_center_id: string;
          p_direct_cost_override: number | null;
          p_price_override: number | null;
          p_reason: string;
          p_service_id: string;
        };
        Returns: {
          available: boolean;
          created_at: string;
          detail_center_id: string;
          direct_cost_override: number | null;
          id: string;
          organization_id: string;
          price_override: number | null;
          service_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "service_center_config";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_user_disabled: {
        Args: { p_disabled: boolean; p_reason: string; p_user_id: string };
        Returns: undefined;
      };
      update_appointment: {
        Args: {
          p_bay_id: string | null;
          p_duration_minutes: number;
          p_id: string;
          p_notes: string | null;
          p_override_reason?: string;
          p_reason: string;
          p_service_ids: string[];
          p_starts_at: string;
          p_technician_id: string | null;
        };
        Returns: {
          bay_id: string | null;
          cancelled_at: string | null;
          client_id: string;
          conflict_override: boolean;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          duration_minutes: number;
          ends_at: string;
          finished_at: string | null;
          id: string;
          is_walk_in: boolean;
          notes: string | null;
          organization_id: string;
          received_at: string | null;
          request_id: string;
          service_order_id: string | null;
          started_at: string | null;
          starts_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          technician_id: string | null;
          updated_at: string;
          vehicle_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "appointments";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      update_service: {
        Args: {
          p_active: boolean;
          p_base_price: number;
          p_description: string;
          p_id: string;
          p_name: string;
          p_reason: string;
          p_revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          p_standard_direct_cost: number;
          p_standard_duration_minutes: number;
        };
        Returns: {
          active: boolean;
          base_price: number;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          standard_direct_cost: number;
          standard_duration_minutes: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "services";
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
      upsert_bay: {
        Args: { p_active: boolean; p_detail_center_id: string; p_id: string | null; p_name: string; p_reason: string };
        Returns: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "bays";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      upsert_technician: {
        Args: {
          p_active: boolean;
          p_detail_center_id: string;
          p_full_name: string;
          p_id: string | null;
          p_reason: string;
        };
        Returns: {
          active: boolean;
          created_at: string;
          detail_center_id: string;
          full_name: string;
          id: string;
          organization_id: string;
          profile_id: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "technicians";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      appointment_status:
        | "programada"
        | "recibida"
        | "en_servicio"
        | "terminada"
        | "entregada"
        | "cancelada"
        | "no_show";
      app_role: "admin_socio" | "encargado" | "operador_recepcion" | "contador" | "comercial_b2b";
      revenue_engine: "recurrente" | "valor_medio" | "premium" | "producto_complemento" | "membresia";
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
      appointment_status: ["programada", "recibida", "en_servicio", "terminada", "entregada", "cancelada", "no_show"],
      app_role: ["admin_socio", "encargado", "operador_recepcion", "contador", "comercial_b2b"],
      revenue_engine: ["recurrente", "valor_medio", "premium", "producto_complemento", "membresia"],
    },
  },
} as const;
