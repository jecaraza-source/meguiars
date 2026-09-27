// Generado con el formato de `supabase gen types typescript` para las migraciones
// 20260922000000_foundation, 20260923000000_multicenter_security,
// 20260925000000_advisor_fixes, 20260926000000_auth_session,
// 20260927000000_clients_vehicles, 20260928000000_service_catalog,
// 20260929000000_agenda, 20260930000000_service_orders,
// 20261001000000_execution_evidence, 20261002000000_memberships, 20261003000000_crm,
// 20261003100000_crm_daily_tasks, 20261004000000_b2b y 20261005000000_upselling. Regenerar tras
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
          {
            foreignKeyName: "appointments_service_order_fk";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
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
      b2b_accounts: {
        Row: {
          billing_email: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          fiscal_zip: string | null;
          home_detail_center_id: string;
          id: string;
          legal_name: string | null;
          name: string;
          notes: string | null;
          organization_id: string;
          request_id: string;
          rfc: string | null;
          status: string;
          tax_regime: string | null;
          updated_at: string;
        };
        Insert: {
          billing_email?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          fiscal_zip?: string | null;
          home_detail_center_id: string;
          id?: string;
          legal_name?: string | null;
          name: string;
          notes?: string | null;
          organization_id: string;
          request_id: string;
          rfc?: string | null;
          status?: string;
          tax_regime?: string | null;
          updated_at?: string;
        };
        Update: {
          billing_email?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          fiscal_zip?: string | null;
          home_detail_center_id?: string;
          id?: string;
          legal_name?: string | null;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          request_id?: string;
          rfc?: string | null;
          status?: string;
          tax_regime?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_accounts_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: true;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "b2b_accounts_organization_id_home_detail_center_id_fkey";
            columns: ["organization_id", "home_detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_agreement_centers: {
        Row: {
          agreement_id: string;
          created_at: string;
          detail_center_id: string;
          organization_id: string;
        };
        Insert: {
          agreement_id: string;
          created_at?: string;
          detail_center_id: string;
          organization_id: string;
        };
        Update: {
          agreement_id?: string;
          created_at?: string;
          detail_center_id?: string;
          organization_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_agreement_centers_organization_id_agreement_id_fkey";
            columns: ["organization_id", "agreement_id"];
            isOneToOne: false;
            referencedRelation: "b2b_agreements";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "b2b_agreement_centers_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_agreements: {
        Row: {
          account_id: string;
          billing_model: string;
          created_at: string;
          created_by: string | null;
          credit_limit: number | null;
          ends_on: string;
          fee_amount: number | null;
          id: string;
          included_units: number | null;
          name: string;
          notes: string | null;
          organization_id: string;
          payment_terms_days: number;
          request_id: string;
          starts_on: string;
          status: string;
          updated_at: string;
          vehicle_rule: string;
        };
        Insert: {
          account_id: string;
          billing_model: string;
          created_at?: string;
          created_by?: string | null;
          credit_limit?: number | null;
          ends_on: string;
          fee_amount?: number | null;
          id?: string;
          included_units?: number | null;
          name: string;
          notes?: string | null;
          organization_id: string;
          payment_terms_days?: number;
          request_id: string;
          starts_on: string;
          status?: string;
          updated_at?: string;
          vehicle_rule?: string;
        };
        Update: {
          account_id?: string;
          billing_model?: string;
          created_at?: string;
          created_by?: string | null;
          credit_limit?: number | null;
          ends_on?: string;
          fee_amount?: number | null;
          id?: string;
          included_units?: number | null;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          payment_terms_days?: number;
          request_id?: string;
          starts_on?: string;
          status?: string;
          updated_at?: string;
          vehicle_rule?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_agreements_organization_id_account_id_fkey";
            columns: ["organization_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_contacts: {
        Row: {
          account_id: string;
          active: boolean;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          is_primary: boolean;
          organization_id: string;
          phone: string | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          is_primary?: boolean;
          organization_id: string;
          phone?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          active?: boolean;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          is_primary?: boolean;
          organization_id?: string;
          phone?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_contacts_organization_id_account_id_fkey";
            columns: ["organization_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_invoices: {
        Row: {
          account_id: string;
          amount: number | null;
          created_at: string;
          created_by: string | null;
          due_on: string;
          fee_amount: number;
          id: string;
          issued_on: string;
          notes: string | null;
          orders_amount: number;
          organization_id: string;
          reference: string;
          request_id: string;
          status: string;
          updated_at: string;
          void_reason: string | null;
        };
        Insert: {
          account_id: string;
          amount?: never;
          created_at?: string;
          created_by?: string | null;
          due_on: string;
          fee_amount?: number;
          id?: string;
          issued_on: string;
          notes?: string | null;
          orders_amount: number;
          organization_id: string;
          reference: string;
          request_id: string;
          status?: string;
          updated_at?: string;
          void_reason?: string | null;
        };
        Update: {
          account_id?: string;
          amount?: never;
          created_at?: string;
          created_by?: string | null;
          due_on?: string;
          fee_amount?: number;
          id?: string;
          issued_on?: string;
          notes?: string | null;
          orders_amount?: number;
          organization_id?: string;
          reference?: string;
          request_id?: string;
          status?: string;
          updated_at?: string;
          void_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_invoices_organization_id_account_id_fkey";
            columns: ["organization_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_payments: {
        Row: {
          account_id: string;
          amount: number;
          created_at: string;
          created_by: string | null;
          id: string;
          invoice_id: string | null;
          method: string;
          organization_id: string;
          paid_on: string;
          reference: string | null;
          request_id: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
        };
        Insert: {
          account_id: string;
          amount: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          method: string;
          organization_id: string;
          paid_on: string;
          reference?: string | null;
          request_id: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          account_id?: string;
          amount?: number;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          invoice_id?: string | null;
          method?: string;
          organization_id?: string;
          paid_on?: string;
          reference?: string | null;
          request_id?: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_payments_organization_id_account_id_fkey";
            columns: ["organization_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "b2b_payments_organization_id_invoice_id_fkey";
            columns: ["organization_id", "invoice_id"];
            isOneToOne: false;
            referencedRelation: "b2b_invoices";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_price_rules: {
        Row: {
          active: boolean;
          agreement_id: string;
          created_at: string;
          id: string;
          kind: string;
          min_monthly_orders: number;
          notes: string | null;
          organization_id: string;
          service_id: string | null;
          updated_at: string;
          value: number | null;
        };
        Insert: {
          active?: boolean;
          agreement_id: string;
          created_at?: string;
          id?: string;
          kind: string;
          min_monthly_orders?: number;
          notes?: string | null;
          organization_id: string;
          service_id?: string | null;
          updated_at?: string;
          value?: number | null;
        };
        Update: {
          active?: boolean;
          agreement_id?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          min_monthly_orders?: number;
          notes?: string | null;
          organization_id?: string;
          service_id?: string | null;
          updated_at?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_price_rules_organization_id_agreement_id_fkey";
            columns: ["organization_id", "agreement_id"];
            isOneToOne: false;
            referencedRelation: "b2b_agreements";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "b2b_price_rules_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      b2b_vehicles: {
        Row: {
          account_id: string;
          active: boolean;
          cost_center: string | null;
          created_at: string;
          driver_name: string | null;
          notes: string | null;
          organization_id: string;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          account_id: string;
          active?: boolean;
          cost_center?: string | null;
          created_at?: string;
          driver_name?: string | null;
          notes?: string | null;
          organization_id: string;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          account_id?: string;
          active?: boolean;
          cost_center?: string | null;
          created_at?: string;
          driver_name?: string | null;
          notes?: string | null;
          organization_id?: string;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "b2b_vehicles_organization_id_account_id_fkey";
            columns: ["organization_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "b2b_vehicles_organization_id_vehicle_id_fkey";
            columns: ["organization_id", "vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
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
      contact_preferences: {
        Row: {
          channel: string;
          client_id: string;
          created_at: string;
          opted_in: boolean;
          organization_id: string;
          source: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          channel: string;
          client_id: string;
          created_at?: string;
          opted_in: boolean;
          organization_id: string;
          source: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          channel?: string;
          client_id?: string;
          created_at?: string;
          opted_in?: boolean;
          organization_id?: string;
          source?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contact_preferences_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      crm_tasks: {
        Row: {
          assigned_to: string | null;
          cancel_reason: string | null;
          channel: string;
          client_id: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string | null;
          dedupe_key: string | null;
          detail_center_id: string;
          due_on: string;
          id: string;
          kind: string;
          membership_id: string | null;
          notes: string | null;
          opportunity_id: string | null;
          organization_id: string;
          outcome: string | null;
          outcome_notes: string | null;
          recommended_service_id: string | null;
          request_id: string | null;
          service_order_id: string | null;
          source: string;
          status: string;
          updated_at: string;
          vehicle_id: string | null;
        };
        Insert: {
          assigned_to?: string | null;
          cancel_reason?: string | null;
          channel: string;
          client_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          detail_center_id: string;
          due_on: string;
          id?: string;
          kind: string;
          membership_id?: string | null;
          notes?: string | null;
          opportunity_id?: string | null;
          organization_id: string;
          outcome?: string | null;
          outcome_notes?: string | null;
          recommended_service_id?: string | null;
          request_id?: string | null;
          service_order_id?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Update: {
          assigned_to?: string | null;
          cancel_reason?: string | null;
          channel?: string;
          client_id?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          dedupe_key?: string | null;
          detail_center_id?: string;
          due_on?: string;
          id?: string;
          kind?: string;
          membership_id?: string | null;
          notes?: string | null;
          opportunity_id?: string | null;
          organization_id?: string;
          outcome?: string | null;
          outcome_notes?: string | null;
          recommended_service_id?: string | null;
          request_id?: string | null;
          service_order_id?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          vehicle_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "crm_tasks_opportunity_fk";
            columns: ["organization_id", "opportunity_id"];
            isOneToOne: false;
            referencedRelation: "sales_opportunities";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_recommended_service_id_fkey";
            columns: ["organization_id", "recommended_service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "crm_tasks_organization_id_vehicle_id_fkey";
            columns: ["organization_id", "vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
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
      inventory_items: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          unit: string;
          unit_cost: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          name: string;
          organization_id: string;
          unit: string;
          unit_cost: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          name?: string;
          organization_id?: string;
          unit?: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_benefits: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          organization_id: string;
          plan_id: string;
          quantity_per_period: number;
          service_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          organization_id: string;
          plan_id: string;
          quantity_per_period: number;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          organization_id?: string;
          plan_id?: string;
          quantity_per_period?: number;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_benefits_organization_id_plan_id_fkey";
            columns: ["organization_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "membership_plans";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "membership_benefits_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      membership_events: {
        Row: {
          actor_id: string | null;
          amount: number | null;
          data: Json | null;
          detail_center_id: string;
          from_state: string | null;
          id: number;
          kind: string;
          membership_center_id: string;
          membership_id: string;
          occurred_at: string;
          organization_id: string;
          period_end: string | null;
          period_start: string | null;
          plan_code: string | null;
          reason: string | null;
          request_id: string | null;
          to_state: string | null;
        };
        Insert: {
          actor_id?: string | null;
          amount?: number | null;
          data?: Json | null;
          detail_center_id: string;
          from_state?: string | null;
          id?: never;
          kind: string;
          membership_center_id: string;
          membership_id: string;
          occurred_at?: string;
          organization_id: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_code?: string | null;
          reason?: string | null;
          request_id?: string | null;
          to_state?: string | null;
        };
        Update: {
          actor_id?: string | null;
          amount?: number | null;
          data?: Json | null;
          detail_center_id?: string;
          from_state?: string | null;
          id?: never;
          kind?: string;
          membership_center_id?: string;
          membership_id?: string;
          occurred_at?: string;
          organization_id?: string;
          period_end?: string | null;
          period_start?: string | null;
          plan_code?: string | null;
          reason?: string | null;
          request_id?: string | null;
          to_state?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "membership_events_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      membership_plans: {
        Row: {
          active: boolean;
          available_from: string;
          available_until: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          name: string;
          organization_id: string;
          period_months: number;
          price: number;
          redeem_scope: string;
          renewal_notice_days: number;
          restrictions: string | null;
          tier: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          available_from?: string;
          available_until?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          period_months: number;
          price: number;
          redeem_scope?: string;
          renewal_notice_days?: number;
          restrictions?: string | null;
          tier: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          available_from?: string;
          available_until?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          period_months?: number;
          price?: number;
          redeem_scope?: string;
          renewal_notice_days?: number;
          restrictions?: string | null;
          tier?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "membership_plans_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      membership_redemptions: {
        Row: {
          amount: number;
          detail_center_id: string;
          discount_id: string | null;
          id: string;
          item_id: string | null;
          membership_center_id: string;
          membership_id: string;
          organization_id: string;
          period_end: string;
          period_start: string;
          quantity: number;
          redeemed_at: string;
          redeemed_by: string | null;
          request_id: string;
          service_code: string;
          service_id: string;
          service_name: string;
          service_order_id: string;
          unit_price: number;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount: number;
          detail_center_id: string;
          discount_id?: string | null;
          id?: string;
          item_id?: string | null;
          membership_center_id: string;
          membership_id: string;
          organization_id: string;
          period_end: string;
          period_start: string;
          quantity: number;
          redeemed_at?: string;
          redeemed_by?: string | null;
          request_id: string;
          service_code: string;
          service_id: string;
          service_name: string;
          service_order_id: string;
          unit_price: number;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number;
          detail_center_id?: string;
          discount_id?: string | null;
          id?: string;
          item_id?: string | null;
          membership_center_id?: string;
          membership_id?: string;
          organization_id?: string;
          period_end?: string;
          period_start?: string;
          quantity?: number;
          redeemed_at?: string;
          redeemed_by?: string | null;
          request_id?: string;
          service_code?: string;
          service_id?: string;
          service_name?: string;
          service_order_id?: string;
          unit_price?: number;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "membership_redemptions_discount_id_fkey";
            columns: ["discount_id"];
            isOneToOne: false;
            referencedRelation: "service_order_discounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "membership_redemptions_organization_id_membership_id_fkey";
            columns: ["organization_id", "membership_id"];
            isOneToOne: false;
            referencedRelation: "memberships";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "membership_redemptions_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "membership_redemptions_service_order_id_item_id_fkey";
            columns: ["service_order_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["service_order_id", "id"];
          },
        ];
      };
      memberships: {
        Row: {
          auto_renew: boolean;
          benefits: Json;
          cancel_reason: string | null;
          cancelled_at: string | null;
          client_id: string;
          created_at: string;
          created_by: string | null;
          detail_center_id: string;
          ends_on: string;
          id: string;
          number: string;
          number_seq: number;
          organization_id: string;
          payment_method_ref: string | null;
          period_anchor: string;
          period_months: number;
          plan_code: string;
          plan_id: string;
          plan_name: string;
          plan_tier: string;
          price: number;
          redeem_scope: string;
          renewal_notice_days: number;
          renewals: number;
          request_id: string;
          started_on: string;
          state: Database["public"]["Enums"]["membership_state"];
          suspended_at: string | null;
          updated_at: string;
          vehicle_id: string;
        };
        Insert: {
          auto_renew?: boolean;
          benefits: Json;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          client_id: string;
          created_at?: string;
          created_by?: string | null;
          detail_center_id: string;
          ends_on: string;
          id?: string;
          number: string;
          number_seq: number;
          organization_id: string;
          payment_method_ref?: string | null;
          period_anchor: string;
          period_months: number;
          plan_code: string;
          plan_id: string;
          plan_name: string;
          plan_tier: string;
          price: number;
          redeem_scope: string;
          renewal_notice_days: number;
          renewals?: number;
          request_id: string;
          started_on: string;
          state?: Database["public"]["Enums"]["membership_state"];
          suspended_at?: string | null;
          updated_at?: string;
          vehicle_id: string;
        };
        Update: {
          auto_renew?: boolean;
          benefits?: Json;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          client_id?: string;
          created_at?: string;
          created_by?: string | null;
          detail_center_id?: string;
          ends_on?: string;
          id?: string;
          number?: string;
          number_seq?: number;
          organization_id?: string;
          payment_method_ref?: string | null;
          period_anchor?: string;
          period_months?: number;
          plan_code?: string;
          plan_id?: string;
          plan_name?: string;
          plan_tier?: string;
          price?: number;
          redeem_scope?: string;
          renewal_notice_days?: number;
          renewals?: number;
          request_id?: string;
          started_on?: string;
          state?: Database["public"]["Enums"]["membership_state"];
          suspended_at?: string | null;
          updated_at?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "memberships_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "memberships_organization_id_plan_id_fkey";
            columns: ["organization_id", "plan_id"];
            isOneToOne: false;
            referencedRelation: "membership_plans";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "memberships_organization_id_vehicle_id_fkey";
            columns: ["organization_id", "vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      opportunity_events: {
        Row: {
          actor_id: string | null;
          detail_center_id: string;
          from_stage_id: string | null;
          id: string;
          kind: string;
          note: string | null;
          occurred_at: string;
          opportunity_id: string;
          opportunity_kind: string;
          organization_id: string;
          owner_id: string | null;
          seq: number;
          to_stage_id: string | null;
          value: number | null;
        };
        Insert: {
          actor_id?: string | null;
          detail_center_id: string;
          from_stage_id?: string | null;
          id?: string;
          kind: string;
          note?: string | null;
          occurred_at?: string;
          opportunity_id: string;
          opportunity_kind: string;
          organization_id: string;
          owner_id?: string | null;
          seq?: never;
          to_stage_id?: string | null;
          value?: number | null;
        };
        Update: {
          actor_id?: string | null;
          detail_center_id?: string;
          from_stage_id?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          occurred_at?: string;
          opportunity_id?: string;
          opportunity_kind?: string;
          organization_id?: string;
          owner_id?: string | null;
          seq?: never;
          to_stage_id?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "opportunity_events_organization_id_from_stage_id_fkey";
            columns: ["organization_id", "from_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "opportunity_events_organization_id_opportunity_id_fkey";
            columns: ["organization_id", "opportunity_id"];
            isOneToOne: false;
            referencedRelation: "sales_opportunities";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "opportunity_events_organization_id_to_stage_id_fkey";
            columns: ["organization_id", "to_stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["organization_id", "id"];
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
      pipeline_stages: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          kind: string;
          name: string;
          organization_id: string;
          position: number;
          probability: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          id?: string;
          kind: string;
          name: string;
          organization_id: string;
          position: number;
          probability: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          name?: string;
          organization_id?: string;
          position?: number;
          probability?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
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
      sales_opportunities: {
        Row: {
          b2b_account_id: string | null;
          client_id: string | null;
          closed_at: string | null;
          company_name: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_title: string | null;
          converted_account_id: string | null;
          converted_agreement_id: string | null;
          created_at: string;
          created_by: string | null;
          detail_center_id: string;
          estimated_value: number;
          expected_close_on: string | null;
          id: string;
          kind: string;
          legal_name: string | null;
          loss_notes: string | null;
          loss_reason: string | null;
          next_action: string | null;
          next_action_on: string | null;
          notes: string | null;
          organization_id: string;
          owner_id: string | null;
          proposed_billing_model: string | null;
          proposed_credit_limit: number | null;
          proposed_fee_amount: number | null;
          proposed_included_units: number | null;
          proposed_months: number | null;
          proposed_payment_terms_days: number | null;
          proposed_vehicle_rule: string | null;
          request_id: string;
          rfc: string | null;
          source: string | null;
          stage_id: string;
          status: string;
          title: string;
          updated_at: string;
          version: number;
          won_value: number | null;
        };
        Insert: {
          b2b_account_id?: string | null;
          client_id?: string | null;
          closed_at?: string | null;
          company_name?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_title?: string | null;
          converted_account_id?: string | null;
          converted_agreement_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          detail_center_id: string;
          estimated_value: number;
          expected_close_on?: string | null;
          id?: string;
          kind: string;
          legal_name?: string | null;
          loss_notes?: string | null;
          loss_reason?: string | null;
          next_action?: string | null;
          next_action_on?: string | null;
          notes?: string | null;
          organization_id: string;
          owner_id?: string | null;
          proposed_billing_model?: string | null;
          proposed_credit_limit?: number | null;
          proposed_fee_amount?: number | null;
          proposed_included_units?: number | null;
          proposed_months?: number | null;
          proposed_payment_terms_days?: number | null;
          proposed_vehicle_rule?: string | null;
          request_id: string;
          rfc?: string | null;
          source?: string | null;
          stage_id: string;
          status?: string;
          title: string;
          updated_at?: string;
          version?: number;
          won_value?: number | null;
        };
        Update: {
          b2b_account_id?: string | null;
          client_id?: string | null;
          closed_at?: string | null;
          company_name?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_title?: string | null;
          converted_account_id?: string | null;
          converted_agreement_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          detail_center_id?: string;
          estimated_value?: number;
          expected_close_on?: string | null;
          id?: string;
          kind?: string;
          legal_name?: string | null;
          loss_notes?: string | null;
          loss_reason?: string | null;
          next_action?: string | null;
          next_action_on?: string | null;
          notes?: string | null;
          organization_id?: string;
          owner_id?: string | null;
          proposed_billing_model?: string | null;
          proposed_credit_limit?: number | null;
          proposed_fee_amount?: number | null;
          proposed_included_units?: number | null;
          proposed_months?: number | null;
          proposed_payment_terms_days?: number | null;
          proposed_vehicle_rule?: string | null;
          request_id?: string;
          rfc?: string | null;
          source?: string | null;
          stage_id?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          version?: number;
          won_value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_opportunities_organization_id_b2b_account_id_fkey";
            columns: ["organization_id", "b2b_account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_converted_account_id_fkey";
            columns: ["organization_id", "converted_account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_converted_agreement_id_fkey";
            columns: ["organization_id", "converted_agreement_id"];
            isOneToOne: false;
            referencedRelation: "b2b_agreements";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_stage_id_fkey";
            columns: ["organization_id", "stage_id"];
            isOneToOne: false;
            referencedRelation: "pipeline_stages";
            referencedColumns: ["organization_id", "id"];
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
      service_order_consumptions: {
        Row: {
          actual_quantity: number;
          created_at: string;
          detail_center_id: string;
          id: string;
          inventory_item_id: string;
          item_id: string;
          note: string | null;
          organization_id: string;
          recorded_by: string | null;
          service_order_id: string;
          standard_quantity: number;
          unit: string;
          unit_cost: number;
          updated_at: string;
        };
        Insert: {
          actual_quantity: number;
          created_at?: string;
          detail_center_id: string;
          id?: string;
          inventory_item_id: string;
          item_id: string;
          note?: string | null;
          organization_id: string;
          recorded_by?: string | null;
          service_order_id: string;
          standard_quantity: number;
          unit: string;
          unit_cost: number;
          updated_at?: string;
        };
        Update: {
          actual_quantity?: number;
          created_at?: string;
          detail_center_id?: string;
          id?: string;
          inventory_item_id?: string;
          item_id?: string;
          note?: string | null;
          organization_id?: string;
          recorded_by?: string | null;
          service_order_id?: string;
          standard_quantity?: number;
          unit?: string;
          unit_cost?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_consumptions_organization_id_inventory_item__fkey";
            columns: ["organization_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_consumptions_organization_id_service_order_i_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_consumptions_service_order_id_item_id_fkey";
            columns: ["service_order_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["service_order_id", "id"];
          },
        ];
      };
      service_order_discounts: {
        Row: {
          amount: number;
          authorization_level: Database["public"]["Enums"]["discount_level"];
          authorized_by: string | null;
          created_at: string;
          id: string;
          item_id: string | null;
          kind: string;
          organization_id: string;
          reason: string;
          service_order_id: string;
          source: string;
          updated_at: string;
          value: number;
          void_reason: string | null;
          voided_at: string | null;
          voided_by: string | null;
        };
        Insert: {
          amount?: number;
          authorization_level: Database["public"]["Enums"]["discount_level"];
          authorized_by?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          kind: string;
          organization_id: string;
          reason: string;
          service_order_id: string;
          source?: string;
          updated_at?: string;
          value: number;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          amount?: number;
          authorization_level?: Database["public"]["Enums"]["discount_level"];
          authorized_by?: string | null;
          created_at?: string;
          id?: string;
          item_id?: string | null;
          kind?: string;
          organization_id?: string;
          reason?: string;
          service_order_id?: string;
          source?: string;
          updated_at?: string;
          value?: number;
          void_reason?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_discounts_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_discounts_service_order_id_item_id_fkey";
            columns: ["service_order_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["service_order_id", "id"];
          },
        ];
      };
      service_order_events: {
        Row: {
          actor_id: string | null;
          data: Json | null;
          detail_center_id: string;
          id: number;
          item_id: string | null;
          kind: string;
          note: string | null;
          occurred_at: string;
          organization_id: string;
          service_order_id: string;
          technician_id: string | null;
        };
        Insert: {
          actor_id?: string | null;
          data?: Json | null;
          detail_center_id: string;
          id?: never;
          item_id?: string | null;
          kind: string;
          note?: string | null;
          occurred_at?: string;
          organization_id: string;
          service_order_id: string;
          technician_id?: string | null;
        };
        Update: {
          actor_id?: string | null;
          data?: Json | null;
          detail_center_id?: string;
          id?: never;
          item_id?: string | null;
          kind?: string;
          note?: string | null;
          occurred_at?: string;
          organization_id?: string;
          service_order_id?: string;
          technician_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_events_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      service_order_evidence: {
        Row: {
          content_type: string;
          created_at: string;
          delete_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          detail_center_id: string;
          height: number | null;
          id: string;
          incident_id: string | null;
          item_id: string | null;
          kind: string;
          note: string | null;
          organization_id: string;
          service_order_id: string;
          size_bytes: number;
          storage_path: string;
          taken_by: string | null;
          updated_at: string;
          width: number | null;
        };
        Insert: {
          content_type: string;
          created_at?: string;
          delete_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          detail_center_id: string;
          height?: number | null;
          id?: string;
          incident_id?: string | null;
          item_id?: string | null;
          kind: string;
          note?: string | null;
          organization_id: string;
          service_order_id: string;
          size_bytes: number;
          storage_path: string;
          taken_by?: string | null;
          updated_at?: string;
          width?: number | null;
        };
        Update: {
          content_type?: string;
          created_at?: string;
          delete_reason?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          detail_center_id?: string;
          height?: number | null;
          id?: string;
          incident_id?: string | null;
          item_id?: string | null;
          kind?: string;
          note?: string | null;
          organization_id?: string;
          service_order_id?: string;
          size_bytes?: number;
          storage_path?: string;
          taken_by?: string | null;
          updated_at?: string;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_evidence_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_evidence_service_order_id_incident_id_fkey";
            columns: ["service_order_id", "incident_id"];
            isOneToOne: false;
            referencedRelation: "service_order_incidents";
            referencedColumns: ["service_order_id", "id"];
          },
          {
            foreignKeyName: "service_order_evidence_service_order_id_item_id_fkey";
            columns: ["service_order_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["service_order_id", "id"];
          },
        ];
      };
      service_order_incidents: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          detail_center_id: string;
          id: string;
          item_id: string | null;
          kind: string;
          organization_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          service_order_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description: string;
          detail_center_id: string;
          id?: string;
          item_id?: string | null;
          kind: string;
          organization_id: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          service_order_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          detail_center_id?: string;
          id?: string;
          item_id?: string | null;
          kind?: string;
          organization_id?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          service_order_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_incidents_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_incidents_service_order_id_item_id_fkey";
            columns: ["service_order_id", "item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["service_order_id", "id"];
          },
        ];
      };
      service_order_items: {
        Row: {
          b2b_price_rule_id: string | null;
          created_at: string;
          duration_minutes: number;
          finished_at: string | null;
          id: string;
          kind: string;
          line_discount: number;
          line_subtotal: number | null;
          list_unit_price: number | null;
          organization_id: string;
          position: number;
          price_source: string;
          quantity: number;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          service_code: string;
          service_id: string;
          service_name: string;
          service_order_id: string;
          started_at: string | null;
          technician_id: string | null;
          unit_direct_cost: number;
          unit_price: number;
          updated_at: string;
          work_started_at: string | null;
          work_status: Database["public"]["Enums"]["item_work_status"];
          worked_minutes: number;
        };
        Insert: {
          b2b_price_rule_id?: string | null;
          created_at?: string;
          duration_minutes: number;
          finished_at?: string | null;
          id?: string;
          kind: string;
          line_discount?: number;
          line_subtotal?: never;
          list_unit_price?: number | null;
          organization_id: string;
          position?: number;
          price_source: string;
          quantity: number;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          service_code: string;
          service_id: string;
          service_name: string;
          service_order_id: string;
          started_at?: string | null;
          technician_id?: string | null;
          unit_direct_cost: number;
          unit_price: number;
          updated_at?: string;
          work_started_at?: string | null;
          work_status?: Database["public"]["Enums"]["item_work_status"];
          worked_minutes?: number;
        };
        Update: {
          b2b_price_rule_id?: string | null;
          created_at?: string;
          duration_minutes?: number;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          line_discount?: number;
          line_subtotal?: never;
          list_unit_price?: number | null;
          organization_id?: string;
          position?: number;
          price_source?: string;
          quantity?: number;
          revenue_engine?: Database["public"]["Enums"]["revenue_engine"];
          service_code?: string;
          service_id?: string;
          service_name?: string;
          service_order_id?: string;
          started_at?: string | null;
          technician_id?: string | null;
          unit_direct_cost?: number;
          unit_price?: number;
          updated_at?: string;
          work_started_at?: string | null;
          work_status?: Database["public"]["Enums"]["item_work_status"];
          worked_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_items_b2b_price_rule_id_fkey";
            columns: ["b2b_price_rule_id"];
            isOneToOne: false;
            referencedRelation: "b2b_price_rules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_order_items_organization_id_service_id_fkey";
            columns: ["organization_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_order_items_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      service_order_staff: {
        Row: {
          added_at: string;
          added_by: string | null;
          detail_center_id: string;
          organization_id: string;
          service_order_id: string;
          technician_id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          detail_center_id: string;
          organization_id: string;
          service_order_id: string;
          technician_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          detail_center_id?: string;
          organization_id?: string;
          service_order_id?: string;
          technician_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_order_staff_detail_center_id_technician_id_fkey";
            columns: ["detail_center_id", "technician_id"];
            isOneToOne: false;
            referencedRelation: "technicians";
            referencedColumns: ["detail_center_id", "id"];
          },
          {
            foreignKeyName: "service_order_staff_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      service_order_status_history: {
        Row: {
          actor_id: string | null;
          detail_center_id: string;
          from_status: Database["public"]["Enums"]["service_order_status"] | null;
          id: number;
          occurred_at: string;
          organization_id: string;
          reason: string | null;
          service_order_id: string;
          to_status: Database["public"]["Enums"]["service_order_status"];
        };
        Insert: {
          actor_id?: string | null;
          detail_center_id: string;
          from_status?: Database["public"]["Enums"]["service_order_status"] | null;
          id?: never;
          occurred_at?: string;
          organization_id: string;
          reason?: string | null;
          service_order_id: string;
          to_status: Database["public"]["Enums"]["service_order_status"];
        };
        Update: {
          actor_id?: string | null;
          detail_center_id?: string;
          from_status?: Database["public"]["Enums"]["service_order_status"] | null;
          id?: never;
          occurred_at?: string;
          organization_id?: string;
          reason?: string | null;
          service_order_id?: string;
          to_status?: Database["public"]["Enums"]["service_order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "service_order_status_history_organization_id_service_order_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      service_orders: {
        Row: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        Insert: {
          appointment_id?: string | null;
          authorized_at?: string | null;
          authorized_by?: string | null;
          authorized_total?: number | null;
          b2b_account_id?: string | null;
          b2b_agreement_id?: string | null;
          b2b_invoice_id?: string | null;
          bay_id?: string | null;
          cancelled_at?: string | null;
          channel?: Database["public"]["Enums"]["sales_channel"];
          channel_reference?: string | null;
          client_email?: string | null;
          client_id: string;
          client_name: string;
          client_phone?: string | null;
          cost_total?: number;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          detail_center_id: string;
          diagnosis?: string | null;
          discount_total?: number;
          estimated_minutes?: number;
          finished_at?: string | null;
          folio: string;
          folio_number: number;
          id?: string;
          next_visit_notes?: string | null;
          next_visit_on?: string | null;
          next_visit_service_id?: string | null;
          observations?: string | null;
          odometer_km?: number | null;
          organization_id: string;
          paid_amount?: number;
          promised_at?: string | null;
          recommendations?: string | null;
          request_id: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["service_order_status"];
          subtotal?: number;
          technician_id?: string | null;
          total?: number;
          updated_at?: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version?: number;
          work_started_at?: string | null;
          worked_minutes?: number;
        };
        Update: {
          appointment_id?: string | null;
          authorized_at?: string | null;
          authorized_by?: string | null;
          authorized_total?: number | null;
          b2b_account_id?: string | null;
          b2b_agreement_id?: string | null;
          b2b_invoice_id?: string | null;
          bay_id?: string | null;
          cancelled_at?: string | null;
          channel?: Database["public"]["Enums"]["sales_channel"];
          channel_reference?: string | null;
          client_email?: string | null;
          client_id?: string;
          client_name?: string;
          client_phone?: string | null;
          cost_total?: number;
          created_at?: string;
          created_by?: string | null;
          delivered_at?: string | null;
          detail_center_id?: string;
          diagnosis?: string | null;
          discount_total?: number;
          estimated_minutes?: number;
          finished_at?: string | null;
          folio?: string;
          folio_number?: number;
          id?: string;
          next_visit_notes?: string | null;
          next_visit_on?: string | null;
          next_visit_service_id?: string | null;
          observations?: string | null;
          odometer_km?: number | null;
          organization_id?: string;
          paid_amount?: number;
          promised_at?: string | null;
          recommendations?: string | null;
          request_id?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["service_order_status"];
          subtotal?: number;
          technician_id?: string | null;
          total?: number;
          updated_at?: string;
          vehicle_id?: string;
          vehicle_make?: string;
          vehicle_model?: string;
          vehicle_plate?: string;
          vehicle_year?: number;
          version?: number;
          work_started_at?: string | null;
          worked_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "service_orders_b2b_account_fk";
            columns: ["organization_id", "b2b_account_id"];
            isOneToOne: false;
            referencedRelation: "b2b_accounts";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_b2b_agreement_fk";
            columns: ["organization_id", "b2b_agreement_id"];
            isOneToOne: false;
            referencedRelation: "b2b_agreements";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_b2b_invoice_fk";
            columns: ["organization_id", "b2b_invoice_id"];
            isOneToOne: false;
            referencedRelation: "b2b_invoices";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_detail_center_id_bay_id_fkey";
            columns: ["detail_center_id", "bay_id"];
            isOneToOne: false;
            referencedRelation: "bays";
            referencedColumns: ["detail_center_id", "id"];
          },
          {
            foreignKeyName: "service_orders_detail_center_id_technician_id_fkey";
            columns: ["detail_center_id", "technician_id"];
            isOneToOne: false;
            referencedRelation: "technicians";
            referencedColumns: ["detail_center_id", "id"];
          },
          {
            foreignKeyName: "service_orders_organization_id_appointment_id_fkey";
            columns: ["organization_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_organization_id_client_id_fkey";
            columns: ["organization_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_organization_id_next_visit_service_id_fkey";
            columns: ["organization_id", "next_visit_service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_orders_organization_id_vehicle_id_fkey";
            columns: ["organization_id", "vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
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
      service_supply_standards: {
        Row: {
          created_at: string;
          inventory_item_id: string;
          organization_id: string;
          quantity: number;
          service_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          inventory_item_id: string;
          organization_id: string;
          quantity: number;
          service_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          inventory_item_id?: string;
          organization_id?: string;
          quantity?: number;
          service_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "service_supply_standards_organization_id_inventory_item_id_fkey";
            columns: ["organization_id", "inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "service_supply_standards_organization_id_service_id_fkey";
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
      upsell_offers: {
        Row: {
          accepted_item_id: string | null;
          accepted_value: number | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          detail_center_id: string;
          id: string;
          offered_at: string;
          offered_by: string | null;
          organization_id: string;
          rejection_reason: string | null;
          rule_id: string;
          service_order_id: string;
          stage: string;
          status: string;
          suggested_price: number;
          target_plan_id: string | null;
          target_service_id: string | null;
          updated_at: string;
        };
        Insert: {
          accepted_item_id?: string | null;
          accepted_value?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          detail_center_id: string;
          id?: string;
          offered_at?: string;
          offered_by?: string | null;
          organization_id: string;
          rejection_reason?: string | null;
          rule_id: string;
          service_order_id: string;
          stage: string;
          status?: string;
          suggested_price: number;
          target_plan_id?: string | null;
          target_service_id?: string | null;
          updated_at?: string;
        };
        Update: {
          accepted_item_id?: string | null;
          accepted_value?: number | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          detail_center_id?: string;
          id?: string;
          offered_at?: string;
          offered_by?: string | null;
          organization_id?: string;
          rejection_reason?: string | null;
          rule_id?: string;
          service_order_id?: string;
          stage?: string;
          status?: string;
          suggested_price?: number;
          target_plan_id?: string | null;
          target_service_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upsell_offers_accepted_item_id_fkey";
            columns: ["accepted_item_id"];
            isOneToOne: false;
            referencedRelation: "service_order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "upsell_offers_organization_id_detail_center_id_fkey";
            columns: ["organization_id", "detail_center_id"];
            isOneToOne: false;
            referencedRelation: "detail_centers";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "upsell_offers_organization_id_rule_id_fkey";
            columns: ["organization_id", "rule_id"];
            isOneToOne: false;
            referencedRelation: "upsell_rules";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "upsell_offers_organization_id_service_order_id_fkey";
            columns: ["organization_id", "service_order_id"];
            isOneToOne: false;
            referencedRelation: "service_orders";
            referencedColumns: ["organization_id", "id"];
          },
        ];
      };
      upsell_rules: {
        Row: {
          active: boolean;
          center_ids: string[] | null;
          channels: string[];
          created_at: string;
          created_by: string | null;
          ends_on: string | null;
          id: string;
          min_order_total: number | null;
          name: string;
          organization_id: string;
          pitch: string;
          priority: number;
          source_service_id: string | null;
          stage: string;
          starts_on: string;
          target_plan_id: string | null;
          target_service_id: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          center_ids?: string[] | null;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          ends_on?: string | null;
          id?: string;
          min_order_total?: number | null;
          name: string;
          organization_id: string;
          pitch: string;
          priority?: number;
          source_service_id?: string | null;
          stage?: string;
          starts_on?: string;
          target_plan_id?: string | null;
          target_service_id?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          center_ids?: string[] | null;
          channels?: string[];
          created_at?: string;
          created_by?: string | null;
          ends_on?: string | null;
          id?: string;
          min_order_total?: number | null;
          name?: string;
          organization_id?: string;
          pitch?: string;
          priority?: number;
          source_service_id?: string | null;
          stage?: string;
          starts_on?: string;
          target_plan_id?: string | null;
          target_service_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upsell_rules_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "upsell_rules_organization_id_source_service_id_fkey";
            columns: ["organization_id", "source_service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "upsell_rules_organization_id_target_service_id_fkey";
            columns: ["organization_id", "target_service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["organization_id", "id"];
          },
          {
            foreignKeyName: "upsell_rules_target_plan_id_fkey";
            columns: ["target_plan_id"];
            isOneToOne: false;
            referencedRelation: "membership_plans";
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
      create_opportunity: {
        Args: {
          p_b2b_account_id?: string | null;
          p_client_id?: string | null;
          p_detail_center_id: string;
          p_estimated_value: number;
          p_expected_close_on?: string | null;
          p_kind: string;
          p_next_action?: string | null;
          p_next_action_on?: string | null;
          p_notes?: string | null;
          p_owner_id?: string | null;
          p_proposal?: Json;
          p_prospect?: Json;
          p_request_id: string;
          p_source?: string | null;
          p_stage_id?: string | null;
          p_title: string;
        };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      update_opportunity: {
        Args: {
          p_estimated_value: number;
          p_expected_close_on: string | null;
          p_id: string;
          p_next_action: string | null;
          p_next_action_on: string | null;
          p_notes: string | null;
          p_owner_id: string | null;
          p_proposal: Json;
          p_prospect: Json;
          p_reason: string;
          p_source: string | null;
          p_title: string;
          p_version: number;
        };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      move_opportunity_stage: {
        Args: { p_id: string; p_note?: string | null; p_stage_id: string; p_version: number };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      add_opportunity_note: {
        Args: { p_id: string; p_note: string };
        Returns: undefined;
      };
      win_opportunity: {
        Args: {
          p_agreement_starts_on?: string | null;
          p_create_agreement?: boolean;
          p_id: string;
          p_note?: string | null;
          p_version: number;
          p_won_value?: number | null;
        };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      lose_opportunity: {
        Args: { p_id: string; p_loss_reason: string; p_notes?: string | null; p_version: number };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      reopen_opportunity: {
        Args: { p_id: string; p_reason: string; p_stage_id: string | null; p_version: number };
        Returns: Database["public"]["Tables"]["sales_opportunities"]["Row"];
        SetofOptions: { from: "*"; to: "sales_opportunities"; isOneToOne: true; isSetofReturn: false };
      };
      create_opportunity_task: {
        Args: {
          p_assigned_to?: string | null;
          p_channel: string | null;
          p_due_on: string;
          p_kind: string;
          p_notes?: string | null;
          p_opportunity_id: string;
          p_request_id: string;
        };
        Returns: Database["public"]["Tables"]["crm_tasks"]["Row"];
        SetofOptions: { from: "*"; to: "crm_tasks"; isOneToOne: true; isSetofReturn: false };
      };
      list_opportunities: {
        Args: {
          p_detail_center_ids: string[];
          p_id?: string | null;
          p_kind?: string | null;
          p_owner_id?: string | null;
          p_status?: string | null;
        };
        Returns: {
          b2b_account_id: string | null;
          center_name: string;
          client_id: string | null;
          closed_at: string | null;
          company_name: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_title: string | null;
          converted_account_id: string | null;
          converted_agreement_id: string | null;
          created_at: string;
          detail_center_id: string;
          display_name: string;
          estimated_value: number;
          expected_close_on: string | null;
          id: string;
          kind: string;
          legal_name: string | null;
          loss_notes: string | null;
          loss_reason: string | null;
          next_action: string | null;
          next_action_on: string | null;
          notes: string | null;
          open_tasks: number;
          organization_id: string;
          owner_id: string | null;
          owner_name: string | null;
          proposed_billing_model: string | null;
          proposed_credit_limit: number | null;
          proposed_fee_amount: number | null;
          proposed_included_units: number | null;
          proposed_months: number | null;
          proposed_payment_terms_days: number | null;
          proposed_vehicle_rule: string | null;
          rfc: string | null;
          source: string | null;
          stage_id: string;
          stage_name: string;
          stage_position: number;
          stage_probability: number;
          status: string;
          title: string;
          today: string;
          version: number;
          won_value: number | null;
        }[];
      };
      opportunity_timeline: {
        Args: { p_id: string };
        Returns: {
          actor_name: string | null;
          from_stage_name: string | null;
          id: string;
          kind: string;
          note: string | null;
          occurred_at: string;
          owner_name: string | null;
          seq: number;
          to_stage_name: string | null;
          value: number | null;
        }[];
      };
      pipeline_owners: {
        Args: { p_detail_center_id: string; p_kind?: string };
        Returns: { full_name: string; user_id: string }[];
      };
      pipeline_metric_facts: {
        Args: { p_detail_center_ids: string[]; p_from: string; p_to: string };
        Returns: {
          closed_on: string | null;
          created_on: string;
          created_value: number;
          current_stage_id: string | null;
          current_value: number | null;
          cycle_days: number | null;
          detail_center_id: string;
          kind: string;
          opportunity_id: string;
          outcome: string | null;
          stages_reached: string[] | null;
          won_value: number | null;
        }[];
      };
      upsert_pipeline_stage: {
        Args: {
          p_active: boolean;
          p_id: string | null;
          p_name: string;
          p_organization_id: string;
          p_position: number;
          p_probability: number;
          p_reason: string;
        };
        Returns: Database["public"]["Tables"]["pipeline_stages"]["Row"];
        SetofOptions: { from: "*"; to: "pipeline_stages"; isOneToOne: true; isSetofReturn: false };
      };
      accept_upsell: {
        Args: { p_order_id: string; p_rule_id: string; p_version: number };
        Returns: Database["public"]["Tables"]["service_orders"]["Row"];
        SetofOptions: { from: "*"; to: "service_orders"; isOneToOne: true; isSetofReturn: false };
      };
      reject_upsell: {
        Args: { p_order_id: string; p_reason?: string | null; p_rule_id: string };
        Returns: undefined;
      };
      upsell_metric_facts: {
        Args: { p_detail_center_ids: string[]; p_from: string; p_to: string };
        Returns: {
          accepted: number;
          detail_center_id: string;
          incremental_revenue: number;
          membership_value: number;
          offered: number;
          orders: number;
          rejected: number;
          rule_id: string;
          rule_name: string;
          target_kind: string;
        }[];
      };
      upsell_suggestions: {
        Args: { p_limit?: number; p_order_id: string };
        Returns: {
          acceptance_rate: number;
          offer_id: string;
          offered_count: number;
          pitch: string;
          price: number;
          priority: number;
          rule_id: string;
          rule_name: string;
          source_service_name: string | null;
          stage: string;
          target_kind: string;
          target_name: string;
          target_plan_id: string | null;
          target_service_id: string | null;
        }[];
      };
      upsert_upsell_rule: {
        Args: {
          p_active: boolean;
          p_center_ids: string[] | null;
          p_channels: string[];
          p_ends_on: string | null;
          p_id: string | null;
          p_min_order_total: number | null;
          p_name: string;
          p_organization_id: string;
          p_pitch: string;
          p_priority: number;
          p_reason: string;
          p_source_service_id: string | null;
          p_stage: string;
          p_starts_on: string;
          p_target_plan_id: string | null;
          p_target_service_id: string | null;
        };
        Returns: Database["public"]["Tables"]["upsell_rules"]["Row"];
        SetofOptions: { from: "*"; to: "upsell_rules"; isOneToOne: true; isSetofReturn: false };
      };
      apply_b2b_account: {
        Args: { p_account_id: string; p_order_id: string; p_purchase_order?: string | null; p_version: number };
        Returns: Database["public"]["Tables"]["service_orders"]["Row"];
        SetofOptions: { from: "*"; to: "service_orders"; isOneToOne: true; isSetofReturn: false };
      };
      b2b_account_orders: {
        Args: { p_account_id: string; p_from: string; p_to: string };
        Returns: {
          agreement_name: string | null;
          center_name: string;
          cost_total: number;
          created_at: string;
          detail_center_id: string;
          evidence_count: number;
          finished_at: string | null;
          folio: string;
          id: string;
          invoice_id: string | null;
          invoice_reference: string | null;
          purchase_order: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          total: number;
          vehicle_label: string;
        }[];
      };
      b2b_account_statement: {
        Args: { p_account_id: string };
        Returns: {
          consumption: number;
          credit_available: number | null;
          credit_limit: number | null;
          exposure: number;
          fees_accrued: number;
          fees_invoiced: number;
          invoiced: number;
          open_orders: number;
          orders_to_invoice: number;
          overdue: number;
          paid: number;
          receivable: number;
          to_invoice: number;
        }[];
      };
      b2b_accounts_for_center: {
        Args: { p_detail_center_id: string };
        Returns: {
          account_id: string;
          account_name: string;
          agreement_id: string;
          agreement_name: string;
          billing_model: string;
          client_id: string;
          ends_on: string;
          vehicle_rule: string;
          vehicles: Json;
        }[];
      };
      b2b_profitability_facts: {
        Args: { p_detail_center_ids: string[]; p_from: string; p_to: string };
        Returns: {
          account_id: string;
          account_name: string;
          cost: number;
          detail_center_id: string;
          fee_revenue: number;
          orders: number;
          revenue: number;
        }[];
      };
      create_b2b_invoice: {
        Args: {
          p_account_id: string;
          p_fee_amount: number;
          p_issued_on: string;
          p_notes: string | null;
          p_order_ids: string[];
          p_reference: string;
          p_request_id: string;
        };
        Returns: Database["public"]["Tables"]["b2b_invoices"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_invoices"; isOneToOne: true; isSetofReturn: false };
      };
      create_b2b_service_order: {
        Args: {
          p_account_id: string;
          p_bay_id?: string | null;
          p_detail_center_id: string;
          p_items: Json;
          p_observations?: string | null;
          p_odometer_km?: number | null;
          p_promised_at?: string | null;
          p_purchase_order?: string | null;
          p_request_id: string;
          p_technician_id?: string | null;
          p_vehicle_id: string;
        };
        Returns: Database["public"]["Tables"]["service_orders"]["Row"];
        SetofOptions: { from: "*"; to: "service_orders"; isOneToOne: true; isSetofReturn: false };
      };
      record_b2b_payment: {
        Args: {
          p_account_id: string;
          p_amount: number;
          p_invoice_id?: string | null;
          p_method: string;
          p_paid_on: string;
          p_reference: string | null;
          p_request_id: string;
        };
        Returns: Database["public"]["Tables"]["b2b_payments"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_payments"; isOneToOne: true; isSetofReturn: false };
      };
      set_b2b_price_rule: {
        Args: {
          p_active: boolean;
          p_agreement_id: string;
          p_id: string | null;
          p_kind: string;
          p_min_monthly_orders: number;
          p_notes: string | null;
          p_reason: string;
          p_service_id: string | null;
          p_value: number | null;
        };
        Returns: Database["public"]["Tables"]["b2b_price_rules"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_price_rules"; isOneToOne: true; isSetofReturn: false };
      };
      set_b2b_vehicle: {
        Args: {
          p_account_id: string;
          p_active: boolean;
          p_cost_center: string | null;
          p_driver_name: string | null;
          p_notes: string | null;
          p_reason: string;
          p_vehicle_id: string;
        };
        Returns: Database["public"]["Tables"]["b2b_vehicles"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_vehicles"; isOneToOne: true; isSetofReturn: false };
      };
      upsert_b2b_account: {
        Args: {
          p_billing_email: string | null;
          p_client_id: string;
          p_fiscal_zip: string | null;
          p_home_detail_center_id: string;
          p_id: string | null;
          p_legal_name: string | null;
          p_name: string;
          p_notes: string | null;
          p_reason: string;
          p_request_id: string;
          p_rfc: string | null;
          p_status: string;
          p_tax_regime: string | null;
        };
        Returns: Database["public"]["Tables"]["b2b_accounts"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_accounts"; isOneToOne: true; isSetofReturn: false };
      };
      upsert_b2b_agreement: {
        Args: {
          p_account_id: string;
          p_billing_model: string;
          p_credit_limit: number | null;
          p_detail_center_ids: string[];
          p_ends_on: string;
          p_fee_amount: number | null;
          p_id: string | null;
          p_included_units: number | null;
          p_name: string;
          p_notes: string | null;
          p_payment_terms_days: number;
          p_reason: string;
          p_request_id: string;
          p_starts_on: string;
          p_status: string;
          p_vehicle_rule: string;
        };
        Returns: Database["public"]["Tables"]["b2b_agreements"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_agreements"; isOneToOne: true; isSetofReturn: false };
      };
      upsert_b2b_contact: {
        Args: {
          p_account_id: string;
          p_active: boolean;
          p_email: string | null;
          p_full_name: string;
          p_id: string | null;
          p_is_primary: boolean;
          p_phone: string | null;
          p_reason: string;
          p_title: string | null;
        };
        Returns: Database["public"]["Tables"]["b2b_contacts"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_contacts"; isOneToOne: true; isSetofReturn: false };
      };
      void_b2b_invoice: {
        Args: { p_invoice_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["b2b_invoices"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_invoices"; isOneToOne: true; isSetofReturn: false };
      };
      void_b2b_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: Database["public"]["Tables"]["b2b_payments"]["Row"];
        SetofOptions: { from: "*"; to: "b2b_payments"; isOneToOne: true; isSetofReturn: false };
      };
      add_service_order_discount: {
        Args: {
          p_item_id: string | null;
          p_kind: string;
          p_order_id: string;
          p_reason: string;
          p_value: number;
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
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
      cancel_crm_task: {
        Args: {
          p_reason: string;
          p_task_id: string;
        };
        Returns: Database["public"]["Tables"]["crm_tasks"]["Row"];
        SetofOptions: {
          from: "*";
          to: "crm_tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      complete_crm_task: {
        Args: {
          p_notes?: string;
          p_outcome: string;
          p_task_id: string;
        };
        Returns: Database["public"]["Tables"]["crm_tasks"]["Row"];
        SetofOptions: {
          from: "*";
          to: "crm_tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      create_crm_task: {
        Args: {
          p_assigned_to?: string;
          p_channel: string | null;
          p_client_id: string;
          p_detail_center_id: string;
          p_due_on: string;
          p_kind: string;
          p_notes?: string;
          p_request_id: string;
          p_vehicle_id?: string;
        };
        Returns: Database["public"]["Tables"]["crm_tasks"]["Row"];
        SetofOptions: {
          from: "*";
          to: "crm_tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_membership: {
        Args: {
          p_client_id: string;
          p_detail_center_id: string;
          p_payment_reference?: string;
          p_plan_id: string;
          p_request_id: string;
          p_starts_on?: string;
          p_vehicle_id: string;
        };
        Returns: Database["public"]["Tables"]["memberships"]["Row"];
        SetofOptions: {
          from: "*";
          to: "memberships";
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
      create_service_order: {
        Args: {
          p_bay_id?: string;
          p_channel?: Database["public"]["Enums"]["sales_channel"];
          p_channel_reference?: string;
          p_client_id: string;
          p_detail_center_id: string;
          p_items: Json;
          p_observations?: string;
          p_odometer_km?: number;
          p_promised_at?: string;
          p_request_id: string;
          p_technician_id?: string;
          p_vehicle_id: string;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_service_order_from_appointment: {
        Args: {
          p_appointment_id: string;
          p_channel?: Database["public"]["Enums"]["sales_channel"];
          p_channel_reference?: string;
          p_odometer_km?: number;
          p_promised_at?: string;
          p_request_id: string;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      crm_customers: {
        Args: {
          p_client_id?: string;
          p_detail_center_ids: string[];
          p_due?: string;
          p_limit?: number;
          p_query?: string;
          p_segment?: string;
        };
        Returns: {
          client_id: string;
          email: string | null;
          full_name: string;
          kind: string;
          last_visit_at: string | null;
          lifetime_value: number;
          membership_ends_on: string | null;
          membership_id: string | null;
          membership_number: string | null;
          membership_plan: string | null;
          membership_status: string | null;
          membership_value: number;
          next_visit_folio: string | null;
          next_visit_on: string | null;
          next_visit_order_id: string | null;
          next_visit_service: string | null;
          next_visit_state: string | null;
          open_tasks: number;
          opted_in_channels: string[];
          phone: string | null;
          segment: string;
          services_value: number;
          visits: number;
        }[];
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
      generate_crm_tasks: {
        Args: {
          p_detail_center_id: string;
        };
        Returns: number;
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
      list_memberships: {
        Args: {
          p_detail_center_id: string;
          p_limit?: number;
          p_query?: string;
          p_status?: string;
        };
        Returns: {
          client_id: string;
          client_name: string;
          ends_on: string;
          id: string;
          number: string;
          period_months: number;
          plan_code: string;
          plan_name: string;
          plan_tier: string;
          price: number;
          renewals: number;
          started_on: string;
          state: Database["public"]["Enums"]["membership_state"];
          status: string;
          vehicle_id: string;
          vehicle_label: string;
        }[];
      };
      list_service_orders: {
        Args: {
          p_detail_center_id: string;
          p_limit?: number;
          p_query?: string;
          p_status?: Database["public"]["Enums"]["service_order_status"];
        };
        Returns: {
          appointment_id: string | null;
          bay_name: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          client_name: string;
          created_at: string;
          estimated_minutes: number;
          folio: string;
          id: string;
          paid_amount: number;
          promised_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          technician_name: string | null;
          total: number;
          vehicle_label: string;
        }[];
      };
      membership_balance: {
        Args: {
          p_membership_id: string;
        };
        Returns: {
          period_end: string | null;
          period_start: string | null;
          quantity_per_period: number;
          remaining: number;
          service_code: string;
          service_id: string;
          service_name: string;
          used: number;
        }[];
      };
      membership_metric_facts: {
        Args: {
          p_detail_center_ids: string[];
          p_from: string;
          p_to: string;
        };
        Returns: {
          cancelled_in_range: boolean;
          detail_center_id: string;
          ends_on: string;
          entitled_units: number;
          expired_in_range: boolean;
          membership_id: string;
          new_in_range: boolean;
          period_months: number;
          price: number;
          renewals_in_range: number;
          revenue_in_range: number;
          started_on: string;
          status: string;
          used_units: number;
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
      record_service_order_consumption: {
        Args: {
          p_actual_quantity: number;
          p_inventory_item_id: string;
          p_item_id: string;
          p_note?: string;
        };
        Returns: {
          actual_quantity: number;
          created_at: string;
          detail_center_id: string;
          id: string;
          inventory_item_id: string;
          item_id: string;
          note: string | null;
          organization_id: string;
          recorded_by: string | null;
          service_order_id: string;
          standard_quantity: number;
          unit: string;
          unit_cost: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_consumptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_service_order_payment: {
        Args: {
          p_amount: number;
          p_method: string;
          p_order_id: string;
          p_reference?: string;
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      redeem_membership_benefit: {
        Args: {
          p_item_id: string;
          p_membership_id: string;
          p_order_id: string;
          p_quantity: number;
          p_request_id: string;
          p_version: number;
        };
        Returns: Database["public"]["Tables"]["membership_redemptions"]["Row"];
        SetofOptions: {
          from: "*";
          to: "membership_redemptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      register_service_order_evidence: {
        Args: {
          p_content_type: string;
          p_height?: number;
          p_incident_id?: string;
          p_item_id?: string;
          p_kind: string;
          p_note?: string;
          p_order_id: string;
          p_size_bytes: number;
          p_storage_path: string;
          p_width?: number;
        };
        Returns: {
          content_type: string;
          created_at: string;
          delete_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          detail_center_id: string;
          height: number | null;
          id: string;
          incident_id: string | null;
          item_id: string | null;
          kind: string;
          note: string | null;
          organization_id: string;
          service_order_id: string;
          size_bytes: number;
          storage_path: string;
          taken_by: string | null;
          updated_at: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_evidence";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      remove_service_order_evidence: {
        Args: {
          p_evidence_id: string;
          p_reason: string;
        };
        Returns: {
          content_type: string;
          created_at: string;
          delete_reason: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          detail_center_id: string;
          height: number | null;
          id: string;
          incident_id: string | null;
          item_id: string | null;
          kind: string;
          note: string | null;
          organization_id: string;
          service_order_id: string;
          size_bytes: number;
          storage_path: string;
          taken_by: string | null;
          updated_at: string;
          width: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_evidence";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      renew_membership: {
        Args: {
          p_membership_id: string;
          p_payment_reference?: string;
          p_plan_id?: string;
          p_request_id: string;
        };
        Returns: Database["public"]["Tables"]["memberships"]["Row"];
        SetofOptions: {
          from: "*";
          to: "memberships";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      report_service_order_incident: {
        Args: {
          p_description: string;
          p_item_id?: string;
          p_kind: string;
          p_order_id: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          description: string;
          detail_center_id: string;
          id: string;
          item_id: string | null;
          kind: string;
          organization_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          service_order_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_incidents";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      reschedule_crm_task: {
        Args: {
          p_due_on: string;
          p_reason: string;
          p_task_id: string;
        };
        Returns: Database["public"]["Tables"]["crm_tasks"]["Row"];
        SetofOptions: {
          from: "*";
          to: "crm_tasks";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      resolve_service_order_incident: {
        Args: {
          p_incident_id: string;
          p_resolution: string;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          description: string;
          detail_center_id: string;
          id: string;
          item_id: string | null;
          kind: string;
          organization_id: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          service_order_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_incidents";
          isOneToOne: true;
          isSetofReturn: false;
        };
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
      set_contact_preference: {
        Args: {
          p_channel: string;
          p_client_id: string;
          p_opted_in: boolean;
          p_reason: string;
          p_source: string;
        };
        Returns: undefined;
      };
      set_membership_benefit: {
        Args: {
          p_notes: string | null;
          p_plan_id: string;
          p_quantity_per_period: number | null;
          p_reason: string;
          p_service_id: string;
        };
        Returns: undefined;
      };
      set_membership_state: {
        Args: {
          p_membership_id: string;
          p_reason: string;
          p_state: Database["public"]["Enums"]["membership_state"];
        };
        Returns: Database["public"]["Tables"]["memberships"]["Row"];
        SetofOptions: {
          from: "*";
          to: "memberships";
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
      set_service_order_item: {
        Args: {
          p_order_id: string;
          p_quantity: number;
          p_reason?: string;
          p_service_id: string;
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_service_order_item_work: {
        Args: {
          p_item_id: string;
          p_note?: string;
          p_status: Database["public"]["Enums"]["item_work_status"];
          p_technician_id?: string;
        };
        Returns: {
          created_at: string;
          duration_minutes: number;
          finished_at: string | null;
          id: string;
          kind: string;
          line_discount: number;
          list_unit_price: number | null;
          b2b_price_rule_id: string | null;
          line_subtotal: number | null;
          organization_id: string;
          position: number;
          price_source: string;
          quantity: number;
          revenue_engine: Database["public"]["Enums"]["revenue_engine"];
          service_code: string;
          service_id: string;
          service_name: string;
          service_order_id: string;
          started_at: string | null;
          technician_id: string | null;
          unit_direct_cost: number;
          unit_price: number;
          updated_at: string;
          work_started_at: string | null;
          work_status: Database["public"]["Enums"]["item_work_status"];
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_order_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_service_order_staff: {
        Args: {
          p_order_id: string;
          p_reason?: string;
          p_technician_ids: string[];
        };
        Returns: {
          added_at: string;
          added_by: string | null;
          detail_center_id: string;
          organization_id: string;
          service_order_id: string;
          technician_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "service_order_staff";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      set_service_order_status: {
        Args: {
          p_order_id: string;
          p_reason?: string;
          p_status: Database["public"]["Enums"]["service_order_status"];
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      set_service_supply_standard: {
        Args: {
          p_inventory_item_id: string;
          p_quantity: number | null;
          p_reason: string;
          p_service_id: string;
        };
        Returns: undefined;
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
      update_service_order_details: {
        Args: {
          p_bay_id: string | null;
          p_channel: Database["public"]["Enums"]["sales_channel"];
          p_channel_reference: string | null;
          p_diagnosis: string | null;
          p_next_visit_notes: string | null;
          p_next_visit_on: string | null;
          p_next_visit_service_id: string | null;
          p_observations: string | null;
          p_odometer_km: number | null;
          p_order_id: string;
          p_promised_at: string | null;
          p_reason?: string;
          p_recommendations: string | null;
          p_technician_id: string | null;
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
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
      upsert_inventory_item: {
        Args: {
          p_active: boolean;
          p_code: string;
          p_id: string | null;
          p_name: string;
          p_organization_id: string;
          p_reason: string;
          p_unit: string;
          p_unit_cost: number;
        };
        Returns: {
          active: boolean;
          code: string;
          created_at: string;
          id: string;
          name: string;
          organization_id: string;
          unit: string;
          unit_cost: number;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "inventory_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      upsert_membership_plan: {
        Args: {
          p_active: boolean;
          p_available_from: string | null;
          p_available_until: string | null;
          p_code: string;
          p_description: string | null;
          p_id: string | null;
          p_name: string;
          p_organization_id: string;
          p_period_months: number;
          p_price: number;
          p_reason: string;
          p_redeem_scope: string;
          p_renewal_notice_days: number;
          p_restrictions: string | null;
          p_tier: string;
        };
        Returns: Database["public"]["Tables"]["membership_plans"]["Row"];
        SetofOptions: {
          from: "*";
          to: "membership_plans";
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
      void_membership_redemption: {
        Args: {
          p_reason: string;
          p_redemption_id: string;
          p_version: number;
        };
        Returns: Database["public"]["Tables"]["membership_redemptions"]["Row"];
        SetofOptions: {
          from: "*";
          to: "membership_redemptions";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      void_service_order_discount: {
        Args: {
          p_discount_id: string;
          p_reason: string;
          p_version: number;
        };
        Returns: {
          appointment_id: string | null;
          authorized_at: string | null;
          authorized_by: string | null;
          authorized_total: number | null;
          b2b_account_id: string | null;
          b2b_agreement_id: string | null;
          b2b_invoice_id: string | null;
          bay_id: string | null;
          cancelled_at: string | null;
          channel: Database["public"]["Enums"]["sales_channel"];
          channel_reference: string | null;
          client_email: string | null;
          client_id: string;
          client_name: string;
          client_phone: string | null;
          cost_total: number;
          created_at: string;
          created_by: string | null;
          delivered_at: string | null;
          detail_center_id: string;
          diagnosis: string | null;
          discount_total: number;
          estimated_minutes: number;
          finished_at: string | null;
          folio: string;
          folio_number: number;
          id: string;
          next_visit_notes: string | null;
          next_visit_on: string | null;
          next_visit_service_id: string | null;
          observations: string | null;
          odometer_km: number | null;
          organization_id: string;
          paid_amount: number;
          promised_at: string | null;
          recommendations: string | null;
          request_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["service_order_status"];
          subtotal: number;
          technician_id: string | null;
          total: number;
          updated_at: string;
          vehicle_id: string;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_plate: string;
          vehicle_year: number;
          version: number;
          work_started_at: string | null;
          worked_minutes: number;
        };
        SetofOptions: {
          from: "*";
          to: "service_orders";
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
      discount_level: "operador" | "encargado" | "admin";
      item_work_status: "pendiente" | "en_proceso" | "pausada" | "terminada";
      membership_state: "activa" | "suspendida" | "cancelada";
      revenue_engine: "recurrente" | "valor_medio" | "premium" | "producto_complemento" | "membresia";
      sales_channel: "b2c" | "membresia" | "b2b";
      service_order_status:
        | "abierta"
        | "autorizada"
        | "en_proceso"
        | "pausada"
        | "terminada"
        | "entregada"
        | "cancelada";
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
      discount_level: ["operador", "encargado", "admin"],
      item_work_status: ["pendiente", "en_proceso", "pausada", "terminada"],
      membership_state: ["activa", "suspendida", "cancelada"],
      revenue_engine: ["recurrente", "valor_medio", "premium", "producto_complemento", "membresia"],
      sales_channel: ["b2c", "membresia", "b2b"],
      service_order_status: ["abierta", "autorizada", "en_proceso", "pausada", "terminada", "entregada", "cancelada"],
    },
  },
} as const;
