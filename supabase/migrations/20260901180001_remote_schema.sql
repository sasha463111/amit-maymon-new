SET local check_function_bodies = off;

CREATE TABLE "public"."audit_events" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "entity_id"  uuid                     NOT NULL,
  "action"     text                     NOT NULL,
  "user_id"    uuid,
  "payload"    jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_events_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."audit_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."bodywork_extras" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "case_id"     uuid                     NOT NULL,
  "description" text                     NOT NULL,
  "image_path"  text                     NOT NULL,
  "created_by"  uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bodywork_extras_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."bodywork_extras"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."branches" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "branches_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."branches"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cars" (
  "id"                      uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "branch_id"               uuid                     NOT NULL,
  "license_plate"           text,
  "make"                    text,
  "model"                   text,
  "year"                    integer,
  "vin"                     text,
  "first_registration_date" date,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "vehicle_type"            text,
  CONSTRAINT "cars_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."cars"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."case_documents" (
  "id"            uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "case_id"       uuid                     NOT NULL,
  "file_name"     text                     NOT NULL,
  "file_path"     text                     NOT NULL,
  "file_size"     bigint,
  "mime_type"     text,
  "uploaded_by"   uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "document_type" text,
  CONSTRAINT "case_documents_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."case_documents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."case_workflow_runs" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "case_id"    uuid                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "case_workflow_runs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."case_workflow_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."case_workflow_steps" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "run_id"       uuid                     NOT NULL,
  "step_key"     text                     NOT NULL,
  "order_index"  integer                  NOT NULL,
  "activated_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "case_workflow_steps_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."case_workflow_steps"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cases" (
  "id"                         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "branch_id"                  uuid                     NOT NULL,
  "car_id"                     uuid                     NOT NULL,
  "case_key"                   text,
  "claim_number"               text,
  "fixcar_link"                text,
  "opened_at"                  timestamp with time zone,
  "treatment_finished_at"      timestamp with time zone,
  "closed_at"                  timestamp with time zone,
  "created_by"                 uuid,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "customer_name"              text,
  "phone"                      text,
  "insurance_company"          text,
  "appraiser_name"             text,
  "event_date"                 date,
  "wheels_check_link"          text,
  "notes"                      text,
  "painter_status"             text                     DEFAULT 'IN_WORK'::text,
  "parts_ordered"              boolean,
  "parts_arrived"              boolean,
  "qc_assignee"                text,
  "estimate_link"              text,
  "closure_checklist_state"    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "appraiser_status"           text,
  "deleted_at"                 timestamp with time zone,
  "deleted_by"                 uuid,
  "enter_work_checklist_state" jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "catalog_numbers_assignee"   text,
  "parts_discounts_assignee"   text,
  "completion_photos_assignee" text,
  "painter_entered_work_at"    timestamp with time zone,
  "parts_arrived_at"           timestamp with time zone,
  "painter_status_other_text"  text,
  "painter_reminder_sent_at"   timestamp with time zone,
  "sub_claim_type_other_text"  text,
  "office_reminder_sent_at"    timestamp with time zone,
  CONSTRAINT "cases_appraiser_status_check" CHECK ((appraiser_status = ANY (ARRAY['APPROVED'::text, 'NOT_APPROVED'::text, 'WAITING_SETTLEMENT'::text]))),
  CONSTRAINT "cases_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."cases"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."ceo_approvals" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "case_id"        uuid                     NOT NULL,
  "rejection_note" text,
  "decided_at"     timestamp with time zone,
  "decided_by"     uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ceo_approvals_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."ceo_approvals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."insurance_branch_mapping" (
  "insurance_company" text NOT NULL,
  "branch_id"         uuid NOT NULL,
  CONSTRAINT "insurance_branch_mapping_pkey" PRIMARY KEY (insurance_company, branch_id)
);

ALTER TABLE "public"."insurance_branch_mapping"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."notifications" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "user_id"      uuid                     NOT NULL,
  "title"        text                     NOT NULL,
  "body"         text,
  "type"         text,
  "read"         boolean                  NOT NULL DEFAULT false,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "case_id"      uuid,
  "triggered_by" uuid,
  "action_url"   text,
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."painter_request_images" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "request_id" uuid                     NOT NULL,
  "image_path" text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "painter_request_images_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."painter_request_images"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."painter_requests" (
  "id"               uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "case_id"          uuid                     NOT NULL,
  "description"      text                     NOT NULL,
  "request_type"     text                     NOT NULL DEFAULT 'WORK'::text,
  "status"           text                     NOT NULL DEFAULT 'PENDING'::text,
  "created_by"       uuid,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "reminder_sent_at" timestamp with time zone,
  "response_note"    text,
  CONSTRAINT "painter_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "painter_requests_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'IN_PROGRESS'::text, 'DONE'::text, 'REJECTED'::text])))
);

ALTER TABLE "public"."painter_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                  uuid                     NOT NULL,
  "full_name"           text                     NOT NULL,
  "is_active"           boolean                  NOT NULL DEFAULT true,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "is_bodywork_advisor" boolean                  NOT NULL DEFAULT false,
  "push_subscriptions"  jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "sees_all_branches"   boolean                  NOT NULL DEFAULT false,
  "branch_ids"          uuid[]                   NOT NULL DEFAULT '{}'::uuid[],
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."push_subscriptions" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "endpoint"     text                     NOT NULL,
  "p256dh"       text                     NOT NULL,
  "auth"         text                     NOT NULL,
  "user_agent"   text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE (endpoint),
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."push_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."referral_documents" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "referral_id" uuid                     NOT NULL,
  "file_name"   text                     NOT NULL,
  "file_path"   text                     NOT NULL,
  "file_size"   bigint,
  "mime_type"   text,
  "uploaded_by" uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "referral_documents_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."referral_documents"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."referral_status_updates" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "referral_id" uuid                     NOT NULL,
  "status_tag"  text,
  "note"        text,
  "created_by"  uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "referral_status_updates_pkey" PRIMARY KEY (id),
  CONSTRAINT "referral_status_updates_status_tag_check"
    CHECK ((status_tag = ANY (ARRAY['AWAITING_REPLACEMENT_CAR'::text, 'AWAITING_PAPERWORK'::text, 'AWAITING_SCHEDULING'::text, 'OTHER'::text])))
);

ALTER TABLE "public"."referral_status_updates"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."referrals" (
  "id"                         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "branch_id"                  uuid                     NOT NULL,
  "customer_name"              text,
  "insurance_company"          text,
  "claim_type"                 text,
  "vehicle_type"               text,
  "vehicle_year"               integer,
  "plate_number"               text,
  "appraiser_name"             text,
  "phone"                      text,
  "status_note"                text,
  "status"                     text                     NOT NULL DEFAULT 'ACTIVE'::text,
  "case_id"                    uuid,
  "created_by"                 uuid,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "current_status_tag"         text,
  "follow_up_date"             date,
  "follow_up_reminder_sent_at" timestamp with time zone,
  CONSTRAINT "referrals_pkey" PRIMARY KEY (id),
  CONSTRAINT "referrals_status_check" CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'CONVERTED'::text, 'CANCELLED'::text])))
);

ALTER TABLE "public"."referrals"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."role_permissions" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "role"       text                     NOT NULL,
  "action"     text                     NOT NULL,
  "enabled"    boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "role_permissions_role_action_key" UNIQUE (ROLE, action)
);

ALTER TABLE "public"."role_permissions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."schema_migrations" (
  "filename"   text                     NOT NULL,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "schema_migrations_pkey" PRIMARY KEY (filename)
);

ALTER TABLE "public"."schema_migrations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."system_messages" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "message"    text                     NOT NULL,
  "is_active"  boolean                  DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "system_messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."system_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workflow_step_templates" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "step_key"              text                     NOT NULL,
  "step_label"            text                     NOT NULL,
  "order_index"           integer                  NOT NULL,
  "is_enabled"            boolean                  NOT NULL DEFAULT true,
  "requires_link"         boolean                  NOT NULL DEFAULT false,
  "requires_file_or_link" boolean                  NOT NULL DEFAULT false,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "requires_ceo_approval" boolean                  NOT NULL DEFAULT false,
  CONSTRAINT "workflow_step_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "workflow_step_templates_step_key_key" UNIQUE (step_key)
);

ALTER TABLE "public"."workflow_step_templates"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."approval_status" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "public"."ceo_approvals"
  ADD COLUMN "status" public.approval_status NOT NULL DEFAULT 'PENDING'::public.approval_status;

CREATE TYPE "public"."approval_type" AS ENUM (
  'ESTIMATE_AND_DETAILS',
  'WHEELS_CHECK',
  'CASE_CLOSURE'
);

ALTER TABLE "public"."ceo_approvals"
  ADD COLUMN "approval_type" public.approval_type NOT NULL;

CREATE TYPE "public"."audit_entity_type" AS ENUM (
  'CASE',
  'WORKFLOW_STEP',
  'APPROVAL',
  'EXTRA'
);

ALTER TABLE "public"."audit_events"
  ADD COLUMN "entity_type" public.audit_entity_type NOT NULL;

CREATE TYPE "public"."claim_type" AS ENUM (
  'PRIVATE',
  'ACCIDENT',
  'FLOOD'
);

ALTER TABLE "public"."cases"
  ADD COLUMN "claim_type" public.claim_type;

CREATE TYPE "public"."extra_status" AS ENUM (
  'IN_TREATMENT',
  'REJECTED',
  'DONE'
);

ALTER TABLE "public"."bodywork_extras"
  ADD COLUMN "status" public.extra_status NOT NULL DEFAULT 'IN_TREATMENT'::public.extra_status;

CREATE TYPE "public"."general_status" AS ENUM (
  'NEW',
  'IN_PROGRESS',
  'COMPLETED'
);

ALTER TABLE "public"."cases"
  ADD COLUMN "general_status" public.general_status NOT NULL DEFAULT 'NEW'::public.general_status;

CREATE TYPE "public"."insurance_type" AS ENUM (
  'COMPREHENSIVE',
  'THIRD_PARTY',
  'PRIVATE',
  'OTHER'
);

ALTER TABLE "public"."cases"
  ADD COLUMN "insurance_type" public.insurance_type;

CREATE TYPE "public"."parts_status" AS ENUM (
  'NO_PARTS',
  'ORDERED',
  'AVAILABLE',
  'AIRMAIL_PENDING'
);

ALTER TABLE "public"."cases"
  ADD COLUMN "parts_status" public.parts_status NOT NULL DEFAULT 'NO_PARTS'::public.parts_status;

CREATE TYPE "public"."step_state" AS ENUM (
  'PENDING',
  'ACTIVE',
  'DONE',
  'SKIPPED'
);

ALTER TABLE "public"."case_workflow_steps"
  ADD COLUMN "state" public.step_state NOT NULL DEFAULT 'PENDING'::public.step_state;

CREATE TYPE "public"."sub_claim_type" AS ENUM (
  'POLICY',
  'THIRD_PARTY',
  'THIRD_PARTY_SETTLEMENT',
  'PRIVATE_REPAIR',
  'SHLOMO_POLICY',
  'SHLOMO_THIRD_PARTY',
  'MILITARY',
  'OTHER'
);

ALTER TABLE "public"."cases"
  ADD COLUMN "sub_claim_type" public.sub_claim_type;

CREATE TYPE "public"."user_role" AS ENUM (
  'SERVICE_MANAGER',
  'OFFICE',
  'CEO',
  'PAINTER',
  'SERVICE_ADVISOR'
);

ALTER TABLE "public"."profiles"
  ADD COLUMN "role" public.user_role NOT NULL;

CREATE TYPE "public"."workflow_run_status" AS ENUM (
  'ACTIVE',
  'COMPLETED'
);

ALTER TABLE "public"."case_workflow_runs"
  ADD COLUMN "status" public.workflow_run_status NOT NULL DEFAULT 'ACTIVE'::public.workflow_run_status;

CREATE TYPE "public"."workflow_type" AS ENUM (
  'PROFESSIONAL',
  'CLOSURE'
);

ALTER TABLE "public"."case_workflow_runs"
  ADD COLUMN "workflow_type" public.workflow_type NOT NULL;

CREATE OR REPLACE FUNCTION public._storage_case_id (
  name text
)
  RETURNS uuid
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO 'public'
  AS $function$
  SELECT NULLIF(split_part(name, '/', 1), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION public._storage_referral_id (
  name text
)
  RETURNS uuid
  LANGUAGE sql
  IMMUTABLE
  AS $function$
  SELECT NULLIF(split_part(name, '/', 1), '')::uuid
$function$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_case (
  case_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cases c
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE c.id = case_id
      AND (p.role = 'CEO' OR p.sees_all_branches = true OR p.branch_id = c.branch_id)
  )
$function$;

CREATE OR REPLACE FUNCTION public._storage_user_can_see_referral (
  referral_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.referrals r
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE r.id = referral_id
      AND p.role IN ('OFFICE', 'CEO')
      AND (p.role = 'CEO' OR p.branch_id = r.branch_id OR p.sees_all_branches = true)
  )
$function$;

CREATE OR REPLACE FUNCTION public.branch_recipients (
  p_branch uuid
)
  RETURNS TABLE (
    id                  uuid,
    role                text,
    is_bodywork_advisor boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT p.id, p.role::text, p.is_bodywork_advisor
  FROM public.profiles p
  WHERE p.is_active = true
    AND (p.branch_id = p_branch OR p.sees_all_branches = true);
$function$;

CREATE OR REPLACE FUNCTION public.can_see_all_branches()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND (role = 'CEO' OR sees_all_branches = true)); $function$;

CREATE OR REPLACE FUNCTION public.fanout_notifications_to_ceos()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, case_id, type, title, body, action_url, triggered_by, read)
  SELECT p.id, NEW.case_id, NEW.type, NEW.title, NEW.body, NEW.action_url, NEW.triggered_by, false
  FROM profiles p
  WHERE p.is_active = true
    AND (p.role = 'CEO' OR (p.role = 'SERVICE_ADVISOR' AND p.sees_all_branches = true))
    AND p.id <> NEW.user_id
    AND (p.role = 'CEO' OR NEW.triggered_by IS NULL OR p.id <> NEW.triggered_by)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = p.id
        AND n.case_id IS NOT DISTINCT FROM NEW.case_id
        AND n.type = NEW.type AND n.title = NEW.title
        AND n.triggered_by IS NOT DISTINCT FROM NEW.triggered_by
        AND n.created_at > now() - interval '10 seconds'
    );
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.get_my_branch_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_branch_ids()
  RETURNS uuid[]
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $function$
BEGIN
  RETURN COALESCE(
    (SELECT branch_ids FROM profiles WHERE id = auth.uid()),
    '{}'::uuid[]
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS public.user_role
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$ SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1; $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'auth'
  AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'SERVICE_ADVISOR' -- default role; admin must update to correct role
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_my_push_subscription (
  p_endpoint text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.profiles
  SET push_subscriptions = COALESCE(
    (SELECT jsonb_agg(s) FROM jsonb_array_elements(push_subscriptions) s
     WHERE s->>'endpoint' <> p_endpoint),
    '[]'::jsonb
  )
  WHERE id = v_user_id;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_push_subscription (
  p_endpoint text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint AND user_id = v_user_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_push_subscription (
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
  VALUES (v_user_id, p_endpoint, p_p256dh, p_auth, p_user_agent, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent,
        last_used_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_my_push_subscription (
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT NULL::text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing JSONB;
  v_new_sub JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  v_new_sub := jsonb_build_object(
    'endpoint',   p_endpoint,
    'p256dh',     p_p256dh,
    'auth',       p_auth,
    'user_agent', p_user_agent,
    'updated_at', extract(epoch FROM now())
  );

  SELECT COALESCE(
    (SELECT jsonb_agg(s)
     FROM jsonb_array_elements(push_subscriptions) s
     WHERE s->>'endpoint' <> p_endpoint),
    '[]'::jsonb
  ) || jsonb_build_array(v_new_sub)
  INTO v_existing
  FROM public.profiles
  WHERE id = v_user_id;

  UPDATE public.profiles
  SET push_subscriptions = v_existing
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$function$;

ALTER TABLE "public"."cars"
  ADD CONSTRAINT "cars_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE "public"."case_workflow_steps"
  ADD CONSTRAINT "case_workflow_steps_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.case_workflow_runs(id) ON DELETE CASCADE;

ALTER TABLE "public"."cases"
  ADD CONSTRAINT "cases_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE "public"."cases"
  ADD CONSTRAINT "cases_car_id_fkey" FOREIGN KEY (car_id) REFERENCES public.cars(id) ON DELETE RESTRICT;

ALTER TABLE "public"."bodywork_extras"
  ADD CONSTRAINT "bodywork_extras_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."case_documents"
  ADD CONSTRAINT "case_documents_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."case_workflow_runs"
  ADD CONSTRAINT "case_workflow_runs_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."ceo_approvals"
  ADD CONSTRAINT "ceo_approvals_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE SET NULL;

ALTER TABLE "public"."painter_requests"
  ADD CONSTRAINT "painter_requests_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

ALTER TABLE "public"."painter_request_images"
  ADD CONSTRAINT "painter_request_images_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.painter_requests(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."audit_events"
  ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."bodywork_extras"
  ADD CONSTRAINT "bodywork_extras_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE "public"."case_documents"
  ADD CONSTRAINT "case_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."case_workflow_steps"
  ADD CONSTRAINT "case_workflow_steps_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."cases"
  ADD CONSTRAINT "cases_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."cases"
  ADD CONSTRAINT "cases_deleted_by_fkey" FOREIGN KEY (deleted_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."ceo_approvals"
  ADD CONSTRAINT "ceo_approvals_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_triggered_by_fkey" FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE "public"."notifications"
  ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."painter_requests"
  ADD CONSTRAINT "painter_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."referral_documents"
  ADD CONSTRAINT "referral_documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."referral_status_updates"
  ADD CONSTRAINT "referral_status_updates_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."referrals"
  ADD CONSTRAINT "referrals_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES public.branches(id);

ALTER TABLE "public"."referrals"
  ADD CONSTRAINT "referrals_case_id_fkey" FOREIGN KEY (case_id) REFERENCES public.cases(id);

ALTER TABLE "public"."referrals"
  ADD CONSTRAINT "referrals_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id);

ALTER TABLE "public"."referral_documents"
  ADD CONSTRAINT "referral_documents_referral_id_fkey" FOREIGN KEY (referral_id) REFERENCES public.referrals(id) ON DELETE CASCADE;

ALTER TABLE "public"."referral_status_updates"
  ADD CONSTRAINT "referral_status_updates_referral_id_fkey" FOREIGN KEY (referral_id) REFERENCES public.referrals(id) ON DELETE CASCADE;

ALTER TABLE "public"."system_messages"
  ADD CONSTRAINT "system_messages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_audit_events_created_at ON public.audit_events USING btree (created_at);

CREATE INDEX idx_audit_events_entity ON public.audit_events USING btree (entity_type, entity_id);

CREATE INDEX idx_audit_events_user_id ON public.audit_events USING btree (user_id);

CREATE INDEX idx_bodywork_extras_case_id ON public.bodywork_extras USING btree (case_id);

CREATE INDEX idx_bodywork_extras_created_by ON public.bodywork_extras USING btree (created_by);

CREATE INDEX idx_bodywork_extras_status ON public.bodywork_extras USING btree (status);

CREATE INDEX idx_cars_branch_id ON public.cars USING btree (branch_id);

CREATE INDEX idx_cars_license_plate ON public.cars USING btree (license_plate);

CREATE INDEX idx_case_documents_case_id ON public.case_documents USING btree (case_id);

CREATE INDEX idx_case_documents_created_at ON public.case_documents USING btree (created_at DESC);

CREATE INDEX idx_case_documents_uploaded_by ON public.case_documents USING btree (uploaded_by);

CREATE INDEX idx_case_workflow_runs_case_id ON public.case_workflow_runs USING btree (case_id);

CREATE INDEX idx_case_workflow_runs_status ON public.case_workflow_runs USING btree (status);

CREATE INDEX idx_case_workflow_steps_completed_by ON public.case_workflow_steps USING btree (completed_by);

CREATE INDEX idx_case_workflow_steps_run_id ON public.case_workflow_steps USING btree (run_id);

CREATE INDEX idx_case_workflow_steps_step_key ON public.case_workflow_steps USING btree (step_key);

CREATE INDEX idx_cases_branch_id ON public.cases USING btree (branch_id);

CREATE INDEX idx_cases_car_id ON public.cases USING btree (car_id);

CREATE UNIQUE INDEX idx_cases_case_key_branch ON public.cases USING btree (branch_id, case_key)
  WHERE (case_key IS NOT NULL);

CREATE INDEX idx_cases_closed_at ON public.cases USING btree (closed_at)
  WHERE (closed_at IS NULL);

CREATE INDEX idx_cases_created_by ON public.cases USING btree (created_by);

CREATE INDEX idx_cases_deleted_at ON public.cases USING btree (deleted_at)
  WHERE (deleted_at IS NULL);

CREATE INDEX idx_cases_deleted_by ON public.cases USING btree (deleted_by);

CREATE INDEX idx_cases_general_status ON public.cases USING btree (general_status);

CREATE INDEX idx_ceo_approvals_case_id ON public.ceo_approvals USING btree (case_id);

CREATE INDEX idx_ceo_approvals_decided_by ON public.ceo_approvals USING btree (decided_by);

CREATE INDEX idx_ceo_approvals_status ON public.ceo_approvals USING btree (status);

CREATE INDEX idx_notifications_case_id ON public.notifications USING btree (case_id);

CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, read);

CREATE INDEX idx_notifications_triggered_by ON public.notifications USING btree (triggered_by);

CREATE INDEX idx_notifications_type ON public.notifications USING btree (user_id, TYPE);

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);

CREATE INDEX idx_painter_request_images_request_id ON public.painter_request_images USING btree (request_id);

CREATE INDEX idx_painter_requests_case_id ON public.painter_requests USING btree (case_id);

CREATE INDEX idx_painter_requests_created_by ON public.painter_requests USING btree (created_by);

CREATE INDEX idx_profiles_role ON public.profiles USING btree (ROLE);

CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions USING btree (user_id);

CREATE INDEX idx_referral_documents_referral_id ON public.referral_documents USING btree (referral_id);

CREATE INDEX idx_referral_status_updates_referral_id ON public.referral_status_updates USING btree (referral_id);

CREATE INDEX idx_referrals_branch_id ON public.referrals USING btree (branch_id);

CREATE INDEX idx_referrals_status ON public.referrals USING btree (status);

CREATE UNIQUE INDEX uniq_case_workflow_runs_one_closure_per_case ON public.case_workflow_runs USING btree (case_id)
  WHERE (workflow_type = 'CLOSURE'::public.workflow_type);

CREATE UNIQUE INDEX uniq_ceo_approvals_case_type ON public.ceo_approvals USING btree (case_id, approval_type);

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER bodywork_extras_updated_at
  BEFORE UPDATE ON public.bodywork_extras
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cars_updated_at
  BEFORE UPDATE ON public.cars
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER case_documents_updated_at
  BEFORE UPDATE ON public.case_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER case_workflow_runs_updated_at
  BEFORE UPDATE ON public.case_workflow_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER case_workflow_steps_updated_at
  BEFORE UPDATE ON public.case_workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ceo_approvals_updated_at
  BEFORE UPDATE ON public.ceo_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_fanout_notifications_to_ceos
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.fanout_notifications_to_ceos();

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "audit_events_insert" ON "public"."audit_events"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));

CREATE POLICY "audit_events_select" ON "public"."audit_events"
  FOR SELECT
  TO PUBLIC
  USING (((EXISTS ( SELECT 1
   FROM public.cases
  WHERE
    ((cases.id = audit_events.entity_id) AND (audit_events.entity_type = 'CASE'::public.audit_entity_type) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR
    public.can_see_all_branches())))) OR public.can_see_all_branches()));

CREATE POLICY "bodywork_extras_insert" ON "public"."bodywork_extras"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = bodywork_extras.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "bodywork_extras_select" ON "public"."bodywork_extras"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = bodywork_extras.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "bodywork_extras_update" ON "public"."bodywork_extras"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = bodywork_extras.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "branches_select" ON "public"."branches"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "cars_insert" ON "public"."cars"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "cars_select" ON "public"."cars"
  FOR SELECT
  TO PUBLIC
  USING (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "cars_update" ON "public"."cars"
  FOR UPDATE
  TO PUBLIC
  USING (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "case_documents_delete" ON "public"."case_documents"
  FOR DELETE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_documents.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_documents_insert" ON "public"."case_documents"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_documents.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_documents_select" ON "public"."case_documents"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_documents.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_workflow_runs_insert_creator" ON "public"."case_workflow_runs"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((case_id IN ( SELECT cases.id
   FROM public.cases
  WHERE (cases.created_by = auth.uid()))));

CREATE POLICY "case_workflow_runs_insert" ON "public"."case_workflow_runs"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_workflow_runs_select" ON "public"."case_workflow_runs"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_workflow_runs_update_ceo" ON "public"."case_workflow_runs"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "case_workflow_runs_update" ON "public"."case_workflow_runs"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "case_workflow_steps_insert_ceo" ON "public"."case_workflow_steps"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "case_workflow_steps_insert_creator" ON "public"."case_workflow_steps"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((run_id IN ( SELECT cwr.id
   FROM (public.case_workflow_runs cwr
     JOIN public.cases c ON ((c.id = cwr.case_id)))
  WHERE (c.created_by = auth.uid()))));

CREATE POLICY "case_workflow_steps_insert" ON "public"."case_workflow_steps"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.case_workflow_runs
  WHERE ((case_workflow_runs.id = case_workflow_steps.run_id) AND (EXISTS ( SELECT 1
           FROM public.cases
          WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()))))))));

CREATE POLICY "case_workflow_steps_select" ON "public"."case_workflow_steps"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.case_workflow_runs
  WHERE ((case_workflow_runs.id = case_workflow_steps.run_id) AND (EXISTS ( SELECT 1
           FROM public.cases
          WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()))))))));

CREATE POLICY "case_workflow_steps_update_ceo" ON "public"."case_workflow_steps"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "case_workflow_steps_update" ON "public"."case_workflow_steps"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.case_workflow_runs
  WHERE ((case_workflow_runs.id = case_workflow_steps.run_id) AND (EXISTS ( SELECT 1
           FROM public.cases
          WHERE ((cases.id = case_workflow_runs.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()))))))));

CREATE POLICY "cases_insert" ON "public"."cases"
  FOR INSERT
  TO PUBLIC
  WITH CHECK (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "cases_select" ON "public"."cases"
  FOR SELECT
  TO PUBLIC
  USING (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "cases_update" ON "public"."cases"
  FOR UPDATE
  TO PUBLIC
  USING (((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()));

CREATE POLICY "ceo_approvals_insert" ON "public"."ceo_approvals"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = ceo_approvals.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "ceo_approvals_select" ON "public"."ceo_approvals"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = ceo_approvals.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "ceo_approvals_update" ON "public"."ceo_approvals"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = ceo_approvals.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "notifications_insert" ON "public"."notifications"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((triggered_by = auth.uid()));

CREATE POLICY "notifications_select" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = auth.uid()));

CREATE POLICY "notifications_update" ON "public"."notifications"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = auth.uid()));

CREATE POLICY "painter_request_images_insert" ON "public"."painter_request_images"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((request_id IN ( SELECT painter_requests.id
   FROM public.painter_requests
  WHERE (painter_requests.created_by = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role))))));

CREATE POLICY "painter_request_images_select" ON "public"."painter_request_images"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "painter_requests_insert" ON "public"."painter_requests"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE
    ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['PAINTER'::public.user_role, 'SERVICE_MANAGER'::public.user_role, 'CEO'::public.user_role,
    'SERVICE_ADVISOR'::public.user_role, 'OFFICE'::public.user_role]))))));

CREATE POLICY "painter_requests_select" ON "public"."painter_requests"
  FOR SELECT
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = painter_requests.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "painter_requests_update" ON "public"."painter_requests"
  FOR UPDATE
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.cases
  WHERE ((cases.id = painter_requests.case_id) AND ((cases.branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches())))));

CREATE POLICY "profiles_select" ON "public"."profiles"
  FOR SELECT
  TO PUBLIC
  USING (((id = auth.uid()) OR public.can_see_all_branches()));

CREATE POLICY "profiles_update_own" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((id = auth.uid()));

CREATE POLICY "push_subscriptions_delete" ON "public"."push_subscriptions"
  FOR DELETE
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role))))));

CREATE POLICY "push_subscriptions_insert" ON "public"."push_subscriptions"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "push_subscriptions_select" ON "public"."push_subscriptions"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role))))));

CREATE POLICY "push_subscriptions_update" ON "public"."push_subscriptions"
  FOR UPDATE
  TO "authenticated"
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "referral_documents_delete" ON "public"."referral_documents"
  FOR DELETE
  TO "authenticated"
  USING (((uploaded_by = auth.uid()) OR (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role]))));

CREATE POLICY "referral_documents_insert" ON "public"."referral_documents"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((referral_id IN ( SELECT referrals.id
   FROM public.referrals
  WHERE ((referrals.branch_id = public.get_my_branch_id()) OR public.can_see_all_branches()))) AND
    (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role])) AND (uploaded_by = auth.uid())));

CREATE POLICY "referral_documents_select" ON "public"."referral_documents"
  FOR SELECT
  TO "authenticated"
  USING (((referral_id IN ( SELECT referrals.id
   FROM public.referrals
  WHERE ((referrals.branch_id = public.get_my_branch_id()) OR public.can_see_all_branches()))) AND
    (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role]))));

CREATE POLICY "referral_status_updates_insert" ON "public"."referral_status_updates"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((referral_id IN ( SELECT referrals.id
   FROM public.referrals
  WHERE ((referrals.branch_id = public.get_my_branch_id()) OR public.can_see_all_branches()))) AND
    (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role])) AND (created_by = auth.uid())));

CREATE POLICY "referral_status_updates_select" ON "public"."referral_status_updates"
  FOR SELECT
  TO "authenticated"
  USING (((referral_id IN ( SELECT referrals.id
   FROM public.referrals
  WHERE ((referrals.branch_id = public.get_my_branch_id()) OR public.can_see_all_branches()))) AND
    (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role, 'CEO'::public.user_role]))));

CREATE POLICY "referrals_insert" ON "public"."referrals"
  FOR INSERT
  TO PUBLIC
  WITH
    CHECK
    ((((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role,
    'CEO'::public.user_role]))));

CREATE POLICY "referrals_select" ON "public"."referrals"
  FOR SELECT
  TO PUBLIC
  USING
    ((((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role,
    'CEO'::public.user_role]))));

CREATE POLICY "referrals_update" ON "public"."referrals"
  FOR UPDATE
  TO PUBLIC
  USING
    ((((branch_id = ANY (public.get_my_branch_ids())) OR public.can_see_all_branches()) AND (public.get_my_role() = ANY (ARRAY['OFFICE'::public.user_role,
    'CEO'::public.user_role]))));

CREATE POLICY "CEO can manage role_permissions" ON "public"."role_permissions"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "ceo_manage_system_messages" ON "public"."system_messages"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "read_system_messages" ON "public"."system_messages"
  FOR SELECT
  TO PUBLIC
  USING ((is_active = true));

CREATE POLICY "All authenticated can read workflow_step_templates" ON "public"."workflow_step_templates"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "CEO can manage workflow_step_templates" ON "public"."workflow_step_templates"
  FOR ALL
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'CEO'::public.user_role)))));

CREATE POLICY "case-documents delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "case-documents read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "case-documents upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'case-documents'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "extras-images read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'extras-images'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "extras-images upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'extras-images'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "painter-images read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'painter-images'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "painter-images upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'painter-images'::text) AND public._storage_user_can_see_case(public._storage_case_id(name))));

CREATE POLICY "referral-documents delete" ON "storage"."objects"
  FOR DELETE
  TO "authenticated"
  USING (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

CREATE POLICY "referral-documents read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

CREATE POLICY "referral-documents upload" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'referral-documents'::text) AND public._storage_user_can_see_referral(public._storage_referral_id(name))));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."notifications";

COMMENT ON SCHEMA "public" IS 'tehila bodyshop — cache bust 1';

GRANT EXECUTE ON FUNCTION "public"."_storage_case_id"(text) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."_storage_referral_id"(text) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."_storage_user_can_see_case"(uuid) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."_storage_user_can_see_referral"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."branch_recipients"(uuid) TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."can_see_all_branches"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."can_see_all_branches"() TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."fanout_notifications_to_ceos"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_branch_id"() TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_branch_ids"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_my_role"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_role"() TO "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."remove_my_push_subscription"(text) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."remove_push_subscription"(text) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."save_push_subscription"(text, text, text, text) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."set_updated_at"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."upsert_my_push_subscription"(text, text, text, text) TO PUBLIC, "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_events" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bodywork_extras" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."branches" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cars" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."case_documents" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."case_workflow_runs" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."case_workflow_steps" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cases" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."ceo_approvals" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."insurance_branch_mapping" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."painter_request_images" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."painter_requests" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."push_subscriptions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."referral_documents" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."referral_status_updates" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."referrals" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."role_permissions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."schema_migrations" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."system_messages" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workflow_step_templates" TO "anon", "authenticated", "postgres", "service_role";

GRANT USAGE ON TYPE "public"."approval_status" TO "postgres";

GRANT USAGE ON TYPE "public"."approval_type" TO "postgres";

GRANT USAGE ON TYPE "public"."audit_entity_type" TO "postgres";

GRANT USAGE ON TYPE "public"."claim_type" TO "postgres";

GRANT USAGE ON TYPE "public"."extra_status" TO "postgres";

GRANT USAGE ON TYPE "public"."general_status" TO "postgres";

GRANT USAGE ON TYPE "public"."insurance_type" TO "postgres";

GRANT USAGE ON TYPE "public"."parts_status" TO "postgres";

GRANT USAGE ON TYPE "public"."step_state" TO "postgres";

GRANT USAGE ON TYPE "public"."sub_claim_type" TO "postgres";

GRANT USAGE ON TYPE "public"."user_role" TO "postgres";

GRANT USAGE ON TYPE "public"."workflow_run_status" TO "postgres";

GRANT USAGE ON TYPE "public"."workflow_type" TO "postgres";

