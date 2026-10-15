import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xzeyxoagzeddadalfkym.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addFleets() {
  try {
    // Get or create branches
    const branches = await supabase
      .from('branches')
      .select('id, name')
      .in('name', ['אשקלון', 'נתיבות']);

    if (branches.error) throw branches.error;

    let ashkelon_id = branches.data?.find(b => b.name === 'אשקלון')?.id;
    let netivot_id = branches.data?.find(b => b.name === 'נתיבות')?.id;

    // If branches don't exist, insert them
    if (!ashkelon_id || !netivot_id) {
      const inserted = await supabase
        .from('branches')
        .insert([
          { name: 'אשקלון', address: 'אשקלון' },
          { name: 'נתיבות', address: 'נתיבות' }
        ])
        .select();

      if (inserted.error) throw inserted.error;
      ashkelon_id = inserted.data.find(b => b.name === 'אשקלון').id;
      netivot_id = inserted.data.find(b => b.name === 'נתיבות').id;
    }

    console.log(`Ashkelon ID: ${ashkelon_id}`);
    console.log(`Netivot ID: ${netivot_id}`);

    // Ashkelon fleet
    const ashkelonCars = [
      { plate: '33-65-530', car_type: 'טויוטה יאריס' },
      { plate: '49-70-820', car_type: 'טויוטה יאריס' },
      { plate: '34-42-537', car_type: 'סוזוקי סוויפט' },
      { plate: '92-78-432', car_type: 'סוזוקי סוויפט' }
    ];

    // Netivot fleet
    const netivotCars = [
      { plate: '126-78-001', car_type: 'קיץ קרון 7 מקומות סוללה' },
      { plate: '861-10-203', car_type: 'איזומרה נכח חדש/צהוב' },
      { plate: '826-62-003', car_type: 'איזומרה' },
      { plate: '497-74-904', car_type: 'יאריס קרוזה' },
      { plate: '497-08-104', car_type: 'יאריס קרוזה' },
      { plate: '497-07-904', car_type: 'יאריס קרוזה' },
      { plate: '497-07-804', car_type: 'יאריס קרוזה' },
      { plate: '497-96-904', car_type: 'יאריס קרוזה' },
      { plate: '498-38-604', car_type: 'יאריס קרוזה בצהוב/צהוב' },
      { plate: '498-10-304', car_type: 'יאריס קרוזה' },
      { plate: '497-99-704', car_type: 'יאריס קרוזה' },
      { plate: '336-55-404', car_type: 'יאריס קרוזה' },
      { plate: '336-55-904', car_type: 'יאריס קרוזה' },
      { plate: '844-74-804', car_type: 'יאריס קרוזה' },
      { plate: '739-46-604', car_type: 'יאריס קרוזה' },
      { plate: '896-36-403', car_type: 'יאריס' },
      { plate: '896-36-203', car_type: 'יאריס' },
      { plate: '896-36-303', car_type: 'יאריס - משובח' },
      { plate: '154-82-504', car_type: 'יאריס' },
      { plate: '27-425-37', car_type: 'יאריס 16' },
      { plate: '804-54-802', car_type: 'סוברולו 22' },
      { plate: '804-54-702', car_type: 'סוברולו 22' },
      { plate: '34-425-37', car_type: 'סוברולו 16' },
      { plate: '92-784-32', car_type: 'סוברולו דולדרום 15' },
      { plate: '873-91-101', car_type: 'ספייסטאר' },
      { plate: '96-668-33', car_type: 'יונדאי 15' },
      { plate: '62-098-52', car_type: 'קורוללה 13' }
    ];

    // Insert Ashkelon
    const ashkelon_insert = await supabase
      .from('loaner_fleet')
      .insert(ashkelonCars.map(car => ({ ...car, branch_id: ashkelon_id, active: true })));

    if (ashkelon_insert.error) throw ashkelon_insert.error;
    console.log(`✓ Ashkelon: ${ashkelonCars.length} cars added`);

    // Insert Netivot
    const netivot_insert = await supabase
      .from('loaner_fleet')
      .insert(netivotCars.map(car => ({ ...car, branch_id: netivot_id, active: true })));

    if (netivot_insert.error) throw netivot_insert.error;
    console.log(`✓ Netivot: ${netivotCars.length} cars added`);

    console.log('\n✅ Fleets added successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addFleets();
