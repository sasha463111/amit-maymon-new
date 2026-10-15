-- Add Ashkelon and Netivot loaner fleets (2026-10-15).

-- Get branch IDs
DO $$
DECLARE
  ashkelon_branch_id uuid;
  netivot_branch_id uuid;
BEGIN
  -- Ensure branches exist
  INSERT INTO public.branches (name, address)
  VALUES
    ('אשקלון', 'אשקלון'),
    ('נתיבות', 'נתיבות')
  ON CONFLICT (name) DO NOTHING;

  SELECT id INTO ashkelon_branch_id FROM public.branches WHERE name = 'אשקלון';
  SELECT id INTO netivot_branch_id FROM public.branches WHERE name = 'נתיבות';

  -- Ashkelon fleet (as inserted 2026-10-15)
  INSERT INTO public.loaner_fleet (plate, car_type, branch_id, active)
  VALUES
    ('33-65-530', 'טויוטה יאריס', ashkelon_branch_id, true),
    ('49-70-820', 'טויוטה יאריס', ashkelon_branch_id, true),
    ('34-42-537', 'סוזוקי סוויפט', ashkelon_branch_id, true),
    ('92-78-432', 'סוזוקי סוויפט', ashkelon_branch_id, true)
  ON CONFLICT (plate) DO NOTHING;

  -- Netivot fleet (2026-10-15)
  INSERT INTO public.loaner_fleet (plate, car_type, branch_id, active)
  VALUES
    ('126-78-001', 'קיץ קרון 7 מקומות סוללה', netivot_branch_id, true),
    ('861-10-203', 'איזומרה נכח חדש/צהוב', netivot_branch_id, true),
    ('826-62-003', 'איזומרה', netivot_branch_id, true),
    ('497-74-904', 'יאריס קרוזה', netivot_branch_id, true),
    ('497-08-104', 'יאריס קרוזה', netivot_branch_id, true),
    ('497-07-904', 'יאריס קרוזה', netivot_branch_id, true),
    ('497-07-804', 'יאריס קרוזה', netivot_branch_id, true),
    ('497-96-904', 'יאריס קרוזה', netivot_branch_id, true),
    ('498-38-604', 'יאריס קרוזה בצהוב/צהוב', netivot_branch_id, true),
    ('498-10-304', 'יאריס קרוזה', netivot_branch_id, true),
    ('497-99-704', 'יאריס קרוזה', netivot_branch_id, true),
    ('336-55-404', 'יאריס קרוזה', netivot_branch_id, true),
    ('336-55-904', 'יאריס קרוזה', netivot_branch_id, true),
    ('844-74-804', 'יאריס קרוזה', netivot_branch_id, true),
    ('739-46-604', 'יאריס קרוזה', netivot_branch_id, true),
    ('896-36-403', 'יאריס', netivot_branch_id, true),
    ('896-36-203', 'יאריס', netivot_branch_id, true),
    ('896-36-303', 'יאריס - משובח', netivot_branch_id, true),
    ('154-82-504', 'יאריס', netivot_branch_id, true),
    ('27-425-37', 'יאריס 16', netivot_branch_id, true),
    ('804-54-802', 'סוברולו 22', netivot_branch_id, true),
    ('804-54-702', 'סוברולו 22', netivot_branch_id, true),
    ('34-425-37', 'סוברולו 16', netivot_branch_id, true),
    ('92-784-32', 'סוברולו דולדרום 15', netivot_branch_id, true),
    ('873-91-101', 'ספייסטאר', netivot_branch_id, true),
    ('96-668-33', 'יונדאי 15', netivot_branch_id, true),
    ('62-098-52', 'קורוללה 13', netivot_branch_id, true)
  ON CONFLICT (plate) DO NOTHING;

  RAISE NOTICE 'Ashkelon ✓ (4 cars) | Netivot ✓ (27 cars)';
END $$;
