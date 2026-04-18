require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const DOWN_UNIT_PHASES = [
  { name: 'Demolition', budget: 1000 },
  { name: 'Framing', budget: 350 },
  { name: 'Drywall', budget: 950 },
  { name: 'Finishing', budget: 1200 },
  { name: 'Electrical', budget: 1000 },
  { name: 'Plumbing', budget: 500 },
  { name: 'Bathroom remodel', budget: 3500 },
  { name: 'Flooring', budget: 1125 },
  { name: 'Windows (6 units)', budget: 600 },
  { name: 'Door repairs', budget: 500 },
  { name: 'Kitchen cabinets', budget: 800 },
  { name: 'Pantry', budget: 250 },
  { name: 'Patio ceiling', budget: 400 },
  { name: 'Shared hallway', budget: 450 },
  { name: 'Painting', budget: 2500 },
  { name: 'Final finishes (trim, fixtures, adjustments)', budget: 660 },
];

const UP_UNIT_PHASES = [
  { name: 'Demolition', budget: 1000 },
  { name: 'Framing', budget: 350 },
  { name: 'Electrical', budget: 1000 },
  { name: 'Plumbing', budget: 500 },
  { name: 'Drywall ceiling', budget: 950 },
  { name: 'Drywall walls', budget: 650 },
  { name: 'Bathroom', budget: 3500 },
  { name: 'Flooring', budget: 1125 },
  { name: 'Windows (11 units)', budget: 1100 },
  { name: 'Door repairs', budget: 500 },
  { name: 'Kitchen cabinets', budget: 800 },
  { name: 'Pantry', budget: 250 },
  { name: 'Ceiling drywall', budget: 950 },
  { name: 'Patio ceiling', budget: 400 },
  { name: 'Painting', budget: 2500 },
  { name: 'Final finishes (trim, fixtures, adjustments)', budget: 1025 },
];

async function seed() {
  console.log('Seeding CHG CRM...\n');

  // 1. Property
  const { data: property, error: propErr } = await supabase
    .from('properties')
    .insert({
      address: '10225 Bernard Ave',
      city: 'Cleveland, OH',
      property_type: 'duplex',
      unit_count: 2,
      status: 'under_construction',
    })
    .select()
    .single();
  if (propErr) throw new Error(`Property insert failed: ${propErr.message}`);
  console.log(`✓ Property: ${property.address} [${property.id}]`);

  // 2. Contractor
  const { data: contractor, error: contractorErr } = await supabase
    .from('contractors')
    .insert({
      name: 'JN Winston LLC',
      trade: 'General Contractor',
      w9_status: 'received',
      agreement_signed: true,
    })
    .select()
    .single();
  if (contractorErr) throw new Error(`Contractor insert failed: ${contractorErr.message}`);
  console.log(`✓ Contractor: ${contractor.name} [${contractor.id}]`);

  // 3. Project #1 — Down Unit
  const { data: proj1, error: proj1Err } = await supabase
    .from('construction_projects')
    .insert({
      property_id: property.id,
      contractor_id: contractor.id,
      name: 'Bernard Ave #1 — Down Unit',
      labor_budget: 32000,
      material_budget: 40000,
      status: 'active',
      start_date: '2026-03-19',
      target_completion: '2026-05-04',
    })
    .select()
    .single();
  if (proj1Err) throw new Error(`Project 1 insert failed: ${proj1Err.message}`);
  console.log(`✓ Project: ${proj1.name} [${proj1.id}]`);

  const { error: phases1Err } = await supabase
    .from('construction_phases')
    .insert(DOWN_UNIT_PHASES.map(ph => ({ ...ph, project_id: proj1.id, completion_pct: 0 })));
  if (phases1Err) throw new Error(`Down unit phases failed: ${phases1Err.message}`);
  console.log(`  └─ ${DOWN_UNIT_PHASES.length} phases added ($${DOWN_UNIT_PHASES.reduce((s, p) => s + p.budget, 0).toLocaleString()} total)`);

  // 4. Project #2 — Up Unit
  const { data: proj2, error: proj2Err } = await supabase
    .from('construction_projects')
    .insert({
      property_id: property.id,
      contractor_id: contractor.id,
      name: 'Bernard Ave #2 — Up Unit',
      labor_budget: 32000,
      material_budget: 40000,
      status: 'active',
      start_date: '2026-03-19',
      target_completion: '2026-05-04',
    })
    .select()
    .single();
  if (proj2Err) throw new Error(`Project 2 insert failed: ${proj2Err.message}`);
  console.log(`✓ Project: ${proj2.name} [${proj2.id}]`);

  const { error: phases2Err } = await supabase
    .from('construction_phases')
    .insert(UP_UNIT_PHASES.map(ph => ({ ...ph, project_id: proj2.id, completion_pct: 0 })));
  if (phases2Err) throw new Error(`Up unit phases failed: ${phases2Err.message}`);
  console.log(`  └─ ${UP_UNIT_PHASES.length} phases added ($${UP_UNIT_PHASES.reduce((s, p) => s + p.budget, 0).toLocaleString()} total)`);

  console.log('\n✓ Seed complete.');
}

seed().catch(err => {
  console.error('\n✗ Seed failed:', err.message);
  process.exit(1);
});
