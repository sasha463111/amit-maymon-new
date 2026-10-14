-- Insurer payment agreements as rules (Amit's sheet "זמני תשלום חברות הביטוח
-- בהסדר", 2026-10-14). Each payer: months after the approval month + the
-- payment day in that month (31 = last day), optional cut-off day (AIG: after
-- the 25th → one month later), or BIWEEKLY (Ayalon: the 15th / end of month).
ALTER TABLE public.insurer_payment_terms
  ALTER COLUMN net_days DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS agreement     text,
  ADD COLUMN IF NOT EXISTS mode          text NOT NULL DEFAULT 'MONTHLY' CHECK (mode IN ('MONTHLY', 'BIWEEKLY')),
  ADD COLUMN IF NOT EXISTS offset_months integer CHECK (offset_months BETWEEN 0 AND 12),
  ADD COLUMN IF NOT EXISTS pay_day       integer CHECK (pay_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS cutoff_day    integer CHECK (cutoff_day BETWEEN 1 AND 31);

INSERT INTO public.insurer_payment_terms (insurer, agreement, mode, offset_months, pay_day, cutoff_day, notes) VALUES
  ('ביטוח ישיר',  'שוטף 60', 'MONTHLY', 3, 1,  NULL, 'אושרה במהלך חודש 1 → תשולם ב-1/4'),
  ('AIG',          'עד 25 לחודש — בחודש העוקב; אחרי 25 — בחודש שאחריו', 'MONTHLY', 1, 2, 25, 'אושרה 10/1 → 02/02; אושרה 26/1 → 02/03'),
  ('איילון',       'מיידי כל שבועיים', 'BIWEEKLY', NULL, NULL, NULL, 'אושרה 5/1 → 15/1; אושרה 16/1 → 31/1'),
  ('הכשרה',        'שוטף 30', 'MONTHLY', 1, 15, NULL, 'אושרה במהלך חודש 1 → 15/2'),
  ('כלל',          'שוטף 30', 'MONTHLY', 1, 31, NULL, 'אושרה במהלך חודש 1 → 28/02'),
  ('ביטוח חקלאי',  'שוטף 30', 'MONTHLY', 1, 15, NULL, 'אושרה במהלך ינואר → 15/2'),
  ('הראל',         'שוטף 30', 'MONTHLY', 1, 15, NULL, 'אושרה במהלך חודש 1 → 15/02'),
  ('מוקד ש.י.ר',   'שוטף 60', 'MONTHLY', 2, 31, NULL, 'עמית: שוטף 60 (סוף החודש השני אחרי האישור)')
ON CONFLICT (insurer) DO UPDATE SET agreement = EXCLUDED.agreement, mode = EXCLUDED.mode, offset_months = EXCLUDED.offset_months,
  pay_day = EXCLUDED.pay_day, cutoff_day = EXCLUDED.cutoff_day, notes = EXCLUDED.notes, updated_at = now();
