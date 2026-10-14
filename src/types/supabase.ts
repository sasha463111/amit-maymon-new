export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          page_url: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          page_url?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          page_url?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["audit_entity_type"]
          id: string
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["audit_entity_type"]
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["audit_entity_type"]
          id?: string
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      bodywork_extras: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          image_path: string
          status: Database["public"]["Enums"]["extra_status"]
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          image_path: string
          status?: Database["public"]["Enums"]["extra_status"]
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          image_path?: string
          status?: Database["public"]["Enums"]["extra_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bodywork_extras_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodywork_extras_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cars: {
        Row: {
          branch_id: string
          created_at: string
          first_registration_date: string | null
          id: string
          license_plate: string | null
          make: string | null
          model: string | null
          updated_at: string
          vehicle_type: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          first_registration_date?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          updated_at?: string
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          first_registration_date?: string | null
          id?: string
          license_plate?: string | null
          make?: string | null
          model?: string | null
          updated_at?: string
          vehicle_type?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cars_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      case_documents: {
        Row: {
          case_id: string
          created_at: string
          document_type: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          document_type?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          document_type?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_workflow_runs: {
        Row: {
          case_id: string
          created_at: string
          id: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          updated_at: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          updated_at?: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          updated_at?: string
          workflow_type?: Database["public"]["Enums"]["workflow_type"]
        }
        Relationships: [
          {
            foreignKeyName: "case_workflow_runs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_workflow_steps: {
        Row: {
          activated_at: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          id: string
          order_index: number
          run_id: string
          state: Database["public"]["Enums"]["step_state"]
          step_key: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          order_index: number
          run_id: string
          state?: Database["public"]["Enums"]["step_state"]
          step_key: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          id?: string
          order_index?: number
          run_id?: string
          state?: Database["public"]["Enums"]["step_state"]
          step_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_workflow_steps_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_workflow_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "case_workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          appraiser_name: string | null
          appraiser_status: string | null
          branch_id: string
          car_id: string
          case_key: string | null
          catalog_numbers_assignee: string | null
          claim_number: string | null
          claim_type: Database["public"]["Enums"]["claim_type"] | null
          closed_at: string | null
          closure_checklist_state: Json
          closure_status_at: string | null
          closure_status_note: string | null
          completion_photos_assignee: string | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          deleted_at: string | null
          deleted_by: string | null
          enter_work_checklist_state: Json
          estimate_link: string | null
          event_date: string | null
          fixcar_link: string | null
          general_status: Database["public"]["Enums"]["general_status"]
          id: string
          insurance_company: string | null
          insurance_type: Database["public"]["Enums"]["insurance_type"] | null
          notes: string | null
          office_reminder_sent_at: string | null
          opened_at: string | null
          painter_entered_work_at: string | null
          painter_finished_at: string | null
          painter_finished_by: string | null
          painter_reminder_sent_at: string | null
          painter_status: string | null
          painter_status_other_text: string | null
          parts_arrived: boolean | null
          parts_arrived_at: string | null
          parts_discounts_assignee: string | null
          parts_ordered: boolean | null
          parts_status: Database["public"]["Enums"]["parts_status"]
          phone: string | null
          qc_assignee: string | null
          sub_claim_type: Database["public"]["Enums"]["sub_claim_type"] | null
          sub_claim_type_other_text: string | null
          treatment_finished_at: string | null
          updated_at: string
          wheels_check_link: string | null
          written_off_at: string | null
          written_off_by: string | null
          written_off_reason: string | null
        }
        Insert: {
          appraiser_name?: string | null
          appraiser_status?: string | null
          branch_id: string
          car_id: string
          case_key?: string | null
          catalog_numbers_assignee?: string | null
          claim_number?: string | null
          claim_type?: Database["public"]["Enums"]["claim_type"] | null
          closed_at?: string | null
          closure_checklist_state?: Json
          closure_status_at?: string | null
          closure_status_note?: string | null
          completion_photos_assignee?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          enter_work_checklist_state?: Json
          estimate_link?: string | null
          event_date?: string | null
          fixcar_link?: string | null
          general_status?: Database["public"]["Enums"]["general_status"]
          id?: string
          insurance_company?: string | null
          insurance_type?: Database["public"]["Enums"]["insurance_type"] | null
          notes?: string | null
          office_reminder_sent_at?: string | null
          opened_at?: string | null
          painter_entered_work_at?: string | null
          painter_finished_at?: string | null
          painter_finished_by?: string | null
          painter_reminder_sent_at?: string | null
          painter_status?: string | null
          painter_status_other_text?: string | null
          parts_arrived?: boolean | null
          parts_arrived_at?: string | null
          parts_discounts_assignee?: string | null
          parts_ordered?: boolean | null
          parts_status?: Database["public"]["Enums"]["parts_status"]
          phone?: string | null
          qc_assignee?: string | null
          sub_claim_type?: Database["public"]["Enums"]["sub_claim_type"] | null
          sub_claim_type_other_text?: string | null
          treatment_finished_at?: string | null
          updated_at?: string
          wheels_check_link?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Update: {
          appraiser_name?: string | null
          appraiser_status?: string | null
          branch_id?: string
          car_id?: string
          case_key?: string | null
          catalog_numbers_assignee?: string | null
          claim_number?: string | null
          claim_type?: Database["public"]["Enums"]["claim_type"] | null
          closed_at?: string | null
          closure_checklist_state?: Json
          closure_status_at?: string | null
          closure_status_note?: string | null
          completion_photos_assignee?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          enter_work_checklist_state?: Json
          estimate_link?: string | null
          event_date?: string | null
          fixcar_link?: string | null
          general_status?: Database["public"]["Enums"]["general_status"]
          id?: string
          insurance_company?: string | null
          insurance_type?: Database["public"]["Enums"]["insurance_type"] | null
          notes?: string | null
          office_reminder_sent_at?: string | null
          opened_at?: string | null
          painter_entered_work_at?: string | null
          painter_finished_at?: string | null
          painter_finished_by?: string | null
          painter_reminder_sent_at?: string | null
          painter_status?: string | null
          painter_status_other_text?: string | null
          parts_arrived?: boolean | null
          parts_arrived_at?: string | null
          parts_discounts_assignee?: string | null
          parts_ordered?: boolean | null
          parts_status?: Database["public"]["Enums"]["parts_status"]
          phone?: string | null
          qc_assignee?: string | null
          sub_claim_type?: Database["public"]["Enums"]["sub_claim_type"] | null
          sub_claim_type_other_text?: string | null
          treatment_finished_at?: string | null
          updated_at?: string
          wheels_check_link?: string | null
          written_off_at?: string | null
          written_off_by?: string | null
          written_off_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_car_id_fkey"
            columns: ["car_id"]
            isOneToOne: false
            referencedRelation: "cars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_painter_finished_by_fkey"
            columns: ["painter_finished_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_written_off_by_fkey"
            columns: ["written_off_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ceo_approvals: {
        Row: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          case_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          rejection_note: string | null
          status: Database["public"]["Enums"]["approval_status"]
          updated_at: string
        }
        Insert: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          case_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          rejection_note?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Update: {
          approval_type?: Database["public"]["Enums"]["approval_type"]
          case_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          rejection_note?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ceo_approvals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ceo_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      closure_status_updates: {
        Row: {
          case_id: string
          created_at: string
          created_by: string
          id: string
          note: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string
          id?: string
          note: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "closure_status_updates_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closure_status_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_branch_mapping: {
        Row: {
          branch_id: string
          insurance_company: string
        }
        Insert: {
          branch_id: string
          insurance_company: string
        }
        Update: {
          branch_id?: string
          insurance_company?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          case_id: string | null
          created_at: string
          emailed_at: string | null
          id: string
          pushed_at: string | null
          read: boolean
          title: string
          triggered_by: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          case_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          pushed_at?: string | null
          read?: boolean
          title: string
          triggered_by?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          case_id?: string | null
          created_at?: string
          emailed_at?: string | null
          id?: string
          pushed_at?: string | null
          read?: boolean
          title?: string
          triggered_by?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      painter_request_images: {
        Row: {
          created_at: string
          id: string
          image_path: string
          request_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path: string
          request_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "painter_request_images_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "painter_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      painter_requests: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          reminder_sent_at: string | null
          request_type: string
          response_note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          reminder_sent_at?: string | null
          request_type?: string
          response_note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          reminder_sent_at?: string | null
          request_type?: string
          response_note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "painter_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "painter_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      part_returns: {
        Row: {
          alert14_sent_at: string | null
          alert7_sent_at: string | null
          branch_id: string
          case_id: string | null
          collected_at: string | null
          collected_by: string | null
          created_at: string
          created_by: string
          credit_amount: number | null
          credit_invoice_number: string | null
          credit_invoice_path: string | null
          credited_at: string | null
          credited_by: string | null
          description: string | null
          dispute_note: string | null
          document_number: string | null
          driver_name: string | null
          id: string
          invoice_path: string | null
          notes: string | null
          plate: string | null
          quantity: number
          reason: string
          reason_other: string | null
          sku: string | null
          status: string
          sticker_path: string
          supplier: string
          supplier_other: string | null
          updated_at: string
        }
        Insert: {
          alert14_sent_at?: string | null
          alert7_sent_at?: string | null
          branch_id: string
          case_id?: string | null
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          created_by?: string
          credit_amount?: number | null
          credit_invoice_number?: string | null
          credit_invoice_path?: string | null
          credited_at?: string | null
          credited_by?: string | null
          description?: string | null
          dispute_note?: string | null
          document_number?: string | null
          driver_name?: string | null
          id?: string
          invoice_path?: string | null
          notes?: string | null
          plate?: string | null
          quantity?: number
          reason: string
          reason_other?: string | null
          sku?: string | null
          status?: string
          sticker_path: string
          supplier: string
          supplier_other?: string | null
          updated_at?: string
        }
        Update: {
          alert14_sent_at?: string | null
          alert7_sent_at?: string | null
          branch_id?: string
          case_id?: string | null
          collected_at?: string | null
          collected_by?: string | null
          created_at?: string
          created_by?: string
          credit_amount?: number | null
          credit_invoice_number?: string | null
          credit_invoice_path?: string | null
          credited_at?: string | null
          credited_by?: string | null
          description?: string | null
          dispute_note?: string | null
          document_number?: string | null
          driver_name?: string | null
          id?: string
          invoice_path?: string | null
          notes?: string | null
          plate?: string | null
          quantity?: number
          reason?: string
          reason_other?: string | null
          sku?: string | null
          status?: string
          sticker_path?: string
          supplier?: string
          supplier_other?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_returns_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_returns_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "part_returns_credited_by_fkey"
            columns: ["credited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_ids: string[]
          created_at: string
          email_notifications: boolean
          full_name: string
          id: string
          is_active: boolean
          is_bodywork_advisor: boolean
          office_function: string | null
          push_subscriptions: Json
          role: Database["public"]["Enums"]["user_role"]
          sees_all_branches: boolean
          updated_at: string
        }
        Insert: {
          branch_ids?: string[]
          created_at?: string
          email_notifications?: boolean
          full_name: string
          id: string
          is_active?: boolean
          is_bodywork_advisor?: boolean
          office_function?: string | null
          push_subscriptions?: Json
          role: Database["public"]["Enums"]["user_role"]
          sees_all_branches?: boolean
          updated_at?: string
        }
        Update: {
          branch_ids?: string[]
          created_at?: string
          email_notifications?: boolean
          full_name?: string
          id?: string
          is_active?: boolean
          is_bodywork_advisor?: boolean
          office_function?: string | null
          push_subscriptions?: Json
          role?: Database["public"]["Enums"]["user_role"]
          sees_all_branches?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          referral_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          referral_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          referral_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_documents_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_status_updates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          referral_id: string
          status_tag: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          referral_id: string
          status_tag?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          referral_id?: string
          status_tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_status_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_status_updates_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          appraiser_name: string | null
          branch_id: string
          case_id: string | null
          claim_type: string | null
          created_at: string
          created_by: string | null
          current_status_tag: string | null
          customer_name: string | null
          follow_up_date: string | null
          follow_up_reminder_sent_at: string | null
          id: string
          important_notes: string | null
          insurance_company: string | null
          phone: string | null
          plate_number: string | null
          status: string
          status_note: string | null
          updated_at: string
          vehicle_type: string | null
          vehicle_year: number | null
        }
        Insert: {
          appraiser_name?: string | null
          branch_id: string
          case_id?: string | null
          claim_type?: string | null
          created_at?: string
          created_by?: string | null
          current_status_tag?: string | null
          customer_name?: string | null
          follow_up_date?: string | null
          follow_up_reminder_sent_at?: string | null
          id?: string
          important_notes?: string | null
          insurance_company?: string | null
          phone?: string | null
          plate_number?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
          vehicle_type?: string | null
          vehicle_year?: number | null
        }
        Update: {
          appraiser_name?: string | null
          branch_id?: string
          case_id?: string | null
          claim_type?: string | null
          created_at?: string
          created_by?: string | null
          current_status_tag?: string | null
          customer_name?: string | null
          follow_up_date?: string | null
          follow_up_reminder_sent_at?: string | null
          id?: string
          important_notes?: string | null
          insurance_company?: string | null
          phone?: string | null
          plate_number?: string | null
          status?: string
          status_note?: string | null
          updated_at?: string
          vehicle_type?: string | null
          vehicle_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action: string
          created_at: string
          enabled: boolean
          id: string
          role: string
        }
        Insert: {
          action: string
          created_at?: string
          enabled?: boolean
          id?: string
          role: string
        }
        Update: {
          action?: string
          created_at?: string
          enabled?: boolean
          id?: string
          role?: string
        }
        Relationships: []
      }
      schema_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      system_messages: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          message: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_step_templates: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          order_index: number
          requires_ceo_approval: boolean
          requires_file_or_link: boolean
          requires_link: boolean
          step_key: string
          step_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          order_index: number
          requires_ceo_approval?: boolean
          requires_file_or_link?: boolean
          requires_link?: boolean
          step_key: string
          step_label: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          order_index?: number
          requires_ceo_approval?: boolean
          requires_file_or_link?: boolean
          requires_link?: boolean
          step_key?: string
          step_label?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _storage_case_id: { Args: { path: string }; Returns: string }
      _storage_referral_id: { Args: { path: string }; Returns: string }
      _storage_user_can_see_case: {
        Args: { case_id: string }
        Returns: boolean
      }
      _storage_user_can_see_referral: {
        Args: { referral_id: string }
        Returns: boolean
      }
      branch_recipients: {
        Args: { p_branch: string }
        Returns: {
          id: string
          is_bodywork_advisor: boolean
          role: string
        }[]
      }
      can_see_all_branches: { Args: never; Returns: boolean }
      can_track_part_returns: { Args: never; Returns: boolean }
      ceo_notification_tier: {
        Args: { p_title: string; p_type: string }
        Returns: string
      }
      check_push_dispatch_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
      claim_notification_email: {
        Args: { p_daily_limit?: number; p_notification_id: string }
        Returns: {
          email: string
          slot: number
        }[]
      }
      get_my_branch_id: { Args: never; Returns: string }
      get_my_branch_ids: { Args: never; Returns: string[] }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_permission: { Args: { p_action: string }; Returns: boolean }
      notification_is_relevant: {
        Args: { p_kind: string; p_office_function: string; p_role: string }
        Returns: boolean
      }
      notification_kind: {
        Args: { p_title: string; p_type: string }
        Returns: string
      }
      release_notification_email: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      remove_my_push_subscription: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      remove_push_subscription: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: string
      }
      upsert_my_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      approval_status: "PENDING" | "APPROVED" | "REJECTED"
      approval_type: "ESTIMATE_AND_DETAILS" | "WHEELS_CHECK" | "CASE_CLOSURE"
      audit_entity_type: "CASE" | "WORKFLOW_STEP" | "APPROVAL" | "EXTRA"
      claim_type: "PRIVATE" | "ACCIDENT" | "FLOOD"
      extra_status: "IN_TREATMENT" | "REJECTED" | "DONE"
      general_status: "NEW" | "IN_PROGRESS" | "COMPLETED"
      insurance_type: "COMPREHENSIVE" | "THIRD_PARTY" | "PRIVATE" | "OTHER"
      parts_status: "NO_PARTS" | "ORDERED" | "AVAILABLE" | "AIRMAIL_PENDING"
      step_state: "PENDING" | "ACTIVE" | "DONE" | "SKIPPED"
      sub_claim_type:
        | "POLICY"
        | "THIRD_PARTY"
        | "THIRD_PARTY_SETTLEMENT"
        | "PRIVATE_REPAIR"
        | "SHLOMO_POLICY"
        | "SHLOMO_THIRD_PARTY"
        | "MILITARY"
        | "OTHER"
      user_role:
        | "SERVICE_MANAGER"
        | "OFFICE"
        | "CEO"
        | "PAINTER"
        | "SERVICE_ADVISOR"
        | "WAREHOUSE"
        | "WAREHOUSE_MANAGER"
        | "COLLECTIONS"
      workflow_run_status: "ACTIVE" | "COMPLETED"
      workflow_type: "PROFESSIONAL" | "CLOSURE"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      approval_status: ["PENDING", "APPROVED", "REJECTED"],
      approval_type: ["ESTIMATE_AND_DETAILS", "WHEELS_CHECK", "CASE_CLOSURE"],
      audit_entity_type: ["CASE", "WORKFLOW_STEP", "APPROVAL", "EXTRA"],
      claim_type: ["PRIVATE", "ACCIDENT", "FLOOD"],
      extra_status: ["IN_TREATMENT", "REJECTED", "DONE"],
      general_status: ["NEW", "IN_PROGRESS", "COMPLETED"],
      insurance_type: ["COMPREHENSIVE", "THIRD_PARTY", "PRIVATE", "OTHER"],
      parts_status: ["NO_PARTS", "ORDERED", "AVAILABLE", "AIRMAIL_PENDING"],
      step_state: ["PENDING", "ACTIVE", "DONE", "SKIPPED"],
      sub_claim_type: [
        "POLICY",
        "THIRD_PARTY",
        "THIRD_PARTY_SETTLEMENT",
        "PRIVATE_REPAIR",
        "SHLOMO_POLICY",
        "SHLOMO_THIRD_PARTY",
        "MILITARY",
        "OTHER",
      ],
      user_role: [
        "SERVICE_MANAGER",
        "OFFICE",
        "CEO",
        "PAINTER",
        "SERVICE_ADVISOR",
        "WAREHOUSE",
        "WAREHOUSE_MANAGER",
        "COLLECTIONS",
      ],
      workflow_run_status: ["ACTIVE", "COMPLETED"],
      workflow_type: ["PROFESSIONAL", "CLOSURE"],
    },
  },
} as const
