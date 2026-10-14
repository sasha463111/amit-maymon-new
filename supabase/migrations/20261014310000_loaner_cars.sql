-- Replacement-car tracking ("מעקב רכב חליפי", Amit 2026-10-14). Office
-- (אילנה, אילנית, אביה) + CEO. Fleet list, hand-overs linked to a case, the
-- customer's signed agreement (photo of the paper form and/or an on-screen
-- signature), any number of scanned documents per hand-over, the return.
-- Server-only tables (RLS on, no grants): read/written through server actions
-- after the role check. Files in the private bucket loaner-docs.
CREATE TABLE IF NOT EXISTS public.loaner_fleet (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate       text NOT NULL UNIQUE,
  car_type    text NOT NULL,
  branch_id   uuid REFERENCES public.branches(id),
  notes       text,
  active      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loaner_handovers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id            uuid REFERENCES public.loaner_fleet(id),
  loaner_plate        text NOT NULL,
  loaner_type         text,
  case_id             uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  branch_id           uuid REFERENCES public.branches(id),
  customer_plate      text,
  customer_name       text,
  customer_phone      text,
  given_at            timestamptz NOT NULL,
  returned_at         timestamptz,
  km_out              integer CHECK (km_out >= 0),
  km_in               integer CHECK (km_in >= 0),
  fuel_out            text,
  fuel_in             text,
  -- the paper form photographed, and/or the on-screen agreement
  signed_form_path    text,
  signature_path      text,
  agreement_version   text,
  agreement_signed_at timestamptz,
  agreement_signer    text,
  notes               text,
  return_notes        text,
  created_by          uuid REFERENCES public.profiles(id),
  returned_by         uuid REFERENCES public.profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loaner_returned_after_given CHECK (returned_at IS NULL OR returned_at >= given_at)
);
CREATE INDEX IF NOT EXISTS idx_loaner_handovers_open ON public.loaner_handovers (returned_at) WHERE returned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loaner_handovers_case ON public.loaner_handovers (case_id);
-- One open hand-over per fleet car.
CREATE UNIQUE INDEX IF NOT EXISTS uq_loaner_fleet_open ON public.loaner_handovers (fleet_id) WHERE returned_at IS NULL AND fleet_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.loaner_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id  uuid NOT NULL REFERENCES public.loaner_handovers(id) ON DELETE CASCADE,
  stage        text NOT NULL DEFAULT 'OUT' CHECK (stage IN ('OUT', 'IN')),
  file_path    text NOT NULL,
  file_name    text,
  mime_type    text,
  uploaded_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loaner_documents_handover ON public.loaner_documents (handover_id);

ALTER TABLE public.loaner_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loaner_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loaner_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loaner_fleet, public.loaner_handovers, public.loaner_documents FROM anon, authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('loaner-docs', 'loaner-docs', false)
ON CONFLICT (id) DO NOTHING;
