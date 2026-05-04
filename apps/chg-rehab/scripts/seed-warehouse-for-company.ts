/**
 * Seed warehouse departments, subcategories, items, and templates for a given company.
 *
 * Idempotent — re-running upserts departments/subcategories by code, refreshes
 * the item list per subcategory, and adds any missing templates.
 *
 * Usage:
 *   tsx apps/chg-rehab/scripts/seed-warehouse-for-company.ts <companyId>
 *   # or, when no arg is given, set TARGET_COMPANY_ID env var
 */

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type WhSub = { code: string; name: string };
type WhDept = { code: string; name: string; icon: string; subs: WhSub[] };
type WhItem = { name: string; meta: string; qty: string; cond: string; val: number };

const WH_DEPARTMENTS: WhDept[] = [
  { code: "flooring", name: "Flooring", icon: "🪵", subs: [
    { code: "gen-flooring", name: "General flooring" },
    { code: "hardwood", name: "Hardwood" },
    { code: "tile", name: "Tile" },
    { code: "lvp", name: "LVP / LVT" },
  ]},
  { code: "drywall", name: "Drywall & plaster", icon: "🧱", subs: [
    { code: "drywall-sheet", name: "Drywall sheets" },
    { code: "joint-compound", name: "Joint compound" },
  ]},
  { code: "electrical", name: "Electrical", icon: "💡", subs: [
    { code: "wire", name: "Wire — Romex / THHN" },
    { code: "outlets", name: "Outlets & switches" },
    { code: "panels", name: "Panels & breakers" },
  ]},
  { code: "plumbing", name: "Plumbing", icon: "🚰", subs: [
    { code: "pipe", name: "PVC / copper pipe" },
    { code: "fixtures", name: "Fixtures" },
  ]},
  { code: "paint", name: "Paint & coatings", icon: "🎨", subs: [
    { code: "paint-int", name: "Interior paint" },
    { code: "paint-ext", name: "Exterior paint" },
  ]},
  { code: "tools", name: "Tools & equipment", icon: "🔧", subs: [
    { code: "power-tools", name: "Power tools" },
    { code: "hand-tools", name: "Hand tools" },
    { code: "safety-equip", name: "Safety equipment" },
    { code: "ladders", name: "Ladders & scaffolding" },
  ]},
  { code: "mechanical", name: "Mechanical / HVAC", icon: "❄", subs: [
    { code: "hvac-systems", name: "HVAC systems" },
    { code: "ductwork", name: "Ductwork & vents" },
    { code: "thermostats", name: "Thermostats & controls" },
    { code: "filters", name: "Filters & maintenance" },
  ]},
  { code: "appliances", name: "Appliances", icon: "🧊", subs: [
    { code: "kitchen-appl", name: "Kitchen appliances" },
    { code: "laundry", name: "Laundry appliances" },
    { code: "water-heaters", name: "Water heaters" },
  ]},
];

const WH_INVENTORY: Record<string, WhItem[]> = {
  "gen-flooring": [
    { name: "Best Laminate — Oak 340 SQ FT", meta: "LVP · Tier 1 — Bulk", qty: "340 SQ FT", cond: "New", val: 2890 },
    { name: 'Subfloor sheathing 3/4"', meta: "OSB · Tier 1 — Bulk", qty: "22 sheets", cond: "New", val: 660 },
    { name: "Transition strips — T-bar aluminum", meta: "Tier 2 — Spec variant", qty: "18 pcs", cond: "New", val: 126 },
    { name: 'Tile spacers 1/8"', meta: "Plastic · Tier 1 — Bulk", qty: "4 bags", cond: "New", val: 48 },
    { name: "Underlayment foam roll 6mm", meta: "Tier 1 — Bulk", qty: "800 SQ FT", cond: "New", val: 320 },
    { name: "Flooring adhesive — premium", meta: "Tier 2 · Multi-surface", qty: "12 gal", cond: "New", val: 216 },
    { name: "Moisture barrier 3mm", meta: "Tier 1 — Bulk", qty: "2,400 SQ FT", cond: "New", val: 480 },
    { name: "Floor leveling compound", meta: "Ardex · Tier 1", qty: "8 bags", cond: "New", val: 144 },
  ],
  hardwood: [
    { name: 'White Oak 3/4" Solid — 500 SQ FT', meta: "Prefinished · Tier 1", qty: "500 SQ FT", cond: "New", val: 3750 },
    { name: 'Red Oak 5" Engineered', meta: "Unfinished · Tier 2", qty: "320 SQ FT", cond: "New", val: 1920 },
    { name: 'Maple 2.25" Strip Flooring', meta: "Tier 1 — Bulk", qty: "200 SQ FT", cond: "New", val: 700 },
    { name: "Hardwood stain — Dark Walnut", meta: "Minwax · Tier 1", qty: "6 qts", cond: "New", val: 84 },
    { name: "Wood filler — natural oak", meta: "Tier 1", qty: "4 tubes", cond: "New", val: 36 },
    { name: 'Flooring nailer nails 2"', meta: "Cleat nails · Bulk", qty: "5,000 ct", cond: "New", val: 95 },
  ],
  tile: [
    { name: "Ceramic floor tile 12x12", meta: "White matte · Tier 1 — Bulk", qty: "450 SQ FT", cond: "New", val: 1350 },
    { name: "Porcelain wall tile 4x12", meta: "Subway · Tier 2", qty: "180 SQ FT", cond: "New", val: 720 },
    { name: "Sanded grout — Charcoal", meta: "Custom Building Products", qty: "8 bags", cond: "New", val: 128 },
    { name: "Unsanded grout — White", meta: "Mapei · Tier 1", qty: "4 bags", cond: "New", val: 52 },
    { name: "Large format tile adhesive", meta: "Schluter · Tier 2", qty: "6 bags", cond: "New", val: 174 },
    { name: 'Cement backer board 3/4"', meta: "HardieBacker · Tier 1", qty: "24 sheets", cond: "New", val: 384 },
    { name: "Grout sealer", meta: "Tier 1", qty: "3 qts", cond: "New", val: 57 },
    { name: "Tile edge trim — brushed nickel", meta: "Schluter Jolly · Tier 2", qty: "40 LF", cond: "New", val: 160 },
  ],
  lvp: [
    { name: "LVP Click-lock Plank — Grey Oak", meta: "12 mil wear · Tier 1", qty: "600 SQ FT", cond: "New", val: 1800 },
    { name: "LVT Stone-look Plank", meta: "Tier 2 — Premium", qty: "250 SQ FT", cond: "New", val: 1000 },
    { name: "Underlayment 3-in-1", meta: "With vapor barrier · Tier 1", qty: "1,000 SQ FT", cond: "New", val: 300 },
    { name: "Stair nosing — oak", meta: "Matching LVP · Tier 1", qty: "12 LF", cond: "New", val: 84 },
    { name: "T-molding transition", meta: "Tier 1 — Bulk", qty: "24 LF", cond: "New", val: 96 },
    { name: "Reducer strip", meta: "Tier 1", qty: "16 LF", cond: "New", val: 48 },
    { name: "Quarter round — white", meta: "PVC · Tier 1", qty: "120 LF", cond: "New", val: 72 },
    { name: "Flooring pull bar kit", meta: "Installation kit", qty: "2 kits", cond: "New", val: 38 },
    { name: "LVP floor adhesive", meta: "Pressure-sensitive · Tier 2", qty: "4 gal", cond: "New", val: 120 },
  ],
  "drywall-sheet": [
    { name: '4x8 1/2" Standard drywall', meta: "USG · Tier 1 — Bulk", qty: "84 sheets", cond: "New", val: 1176 },
    { name: '4x12 5/8" Type X fire-rated', meta: "Georgia-Pacific · Tier 1", qty: "36 sheets", cond: "New", val: 720 },
    { name: '4x8 5/8" Moisture resistant', meta: "Green board · Tier 1", qty: "24 sheets", cond: "New", val: 480 },
    { name: "Corner bead — metal", meta: "Tier 1 — Bulk", qty: "60 pcs", cond: "New", val: 90 },
    { name: 'Drywall screws 1-5/8"', meta: "Coarse thread · Bulk", qty: "5 lbs", cond: "New", val: 35 },
    { name: "Fiberglass drywall tape", meta: "Self-adhesive · Tier 1", qty: "12 rolls", cond: "New", val: 60 },
    { name: "Ceiling texture spray", meta: "Orange peel · Tier 2", qty: "6 cans", cond: "New", val: 54 },
  ],
  "joint-compound": [
    { name: "Pre-mixed all-purpose compound", meta: "USG · 5 gal · Tier 1", qty: "8 buckets", cond: "New", val: 200 },
    { name: "Setting compound 45-min", meta: "USG Durabond · Tier 1", qty: "4 bags", cond: "New", val: 72 },
    { name: "Lightweight topping compound", meta: "Sheetrock Plus 3 · Tier 2", qty: "3 buckets", cond: "New", val: 105 },
    { name: "Patching plaster", meta: "DAP · Tier 1", qty: "6 containers", cond: "New", val: 48 },
    { name: "Skim coat compound", meta: "USG · Tier 2", qty: "2 bags", cond: "New", val: 44 },
    { name: "Bonding primer", meta: "Zinsser · Tier 1", qty: "4 gal", cond: "New", val: 96 },
    { name: "Texture spray — knockdown", meta: "Tier 1", qty: "4 cans", cond: "New", val: 36 },
    { name: "Mud pan & knife set", meta: "Hyde Tools", qty: "3 sets", cond: "New", val: 90 },
  ],
  wire: [
    { name: "12/2 Romex NM-B 250ft", meta: "Southwire · Tier 1", qty: "8 rolls", cond: "New", val: 1040 },
    { name: "14/2 Romex NM-B 250ft", meta: "Southwire · Tier 1", qty: "5 rolls", cond: "New", val: 450 },
    { name: "10/2 Romex NM-B 100ft", meta: "Tier 1", qty: "3 rolls", cond: "New", val: 270 },
    { name: "12 AWG THHN — Black 500ft", meta: "Tier 1", qty: "2 spools", cond: "New", val: 180 },
    { name: '1/2" EMT conduit 10ft', meta: "Tier 1 — Bulk", qty: "20 sticks", cond: "New", val: 140 },
  ],
  outlets: [
    { name: "15A duplex outlet — white", meta: "Leviton · Tier 1 — Bulk", qty: "48 pcs", cond: "New", val: 96 },
    { name: "20A outlet — white", meta: "Leviton · Tier 1", qty: "24 pcs", cond: "New", val: 72 },
    { name: "GFCI outlet 15A — white", meta: "Leviton · Tier 1", qty: "18 pcs", cond: "New", val: 198 },
    { name: "AFCI breaker outlet", meta: "Square D · Tier 2", qty: "6 pcs", cond: "New", val: 180 },
    { name: "Single pole switch — white", meta: "Leviton · Bulk", qty: "36 pcs", cond: "New", val: 54 },
    { name: "3-way switch — white", meta: "Leviton · Tier 1", qty: "12 pcs", cond: "New", val: 36 },
    { name: "Dimmer switch — white", meta: "Lutron · Tier 2", qty: "8 pcs", cond: "New", val: 120 },
    { name: "Decora outlet covers — white", meta: "Tier 1 — Bulk", qty: "60 pcs", cond: "New", val: 30 },
  ],
  panels: [
    { name: "200A main panel — Square D", meta: "QO series · Tier 1", qty: "1 unit", cond: "New", val: 285 },
    { name: "100A subpanel — Square D", meta: "QO series · Tier 2", qty: "1 unit", cond: "New", val: 145 },
    { name: "20A single-pole breaker", meta: "Square D QO · Tier 1", qty: "12 pcs", cond: "New", val: 144 },
  ],
  pipe: [
    { name: '3/4" PVC Schedule 40 — 10ft', meta: "Tier 1 — Bulk", qty: "20 sticks", cond: "New", val: 120 },
    { name: '1/2" PVC Schedule 40 — 10ft', meta: "Tier 1 — Bulk", qty: "15 sticks", cond: "New", val: 60 },
    { name: '3/4" Type L copper — 10ft', meta: "Mueller · Tier 2", qty: "8 sticks", cond: "New", val: 280 },
    { name: '1/2" Type M copper — 10ft', meta: "Mueller · Tier 2", qty: "6 sticks", cond: "New", val: 156 },
    { name: '4" ABS drain pipe — 10ft', meta: "Tier 1", qty: "4 sticks", cond: "New", val: 60 },
    { name: 'P-trap 1.5"', meta: "Chrome · Tier 1", qty: "8 pcs", cond: "New", val: 64 },
    { name: "PVC cement & primer kit", meta: "Tier 1", qty: "6 kits", cond: "New", val: 54 },
    { name: "Teflon tape — bulk", meta: "Tier 1", qty: "24 rolls", cond: "New", val: 24 },
    { name: "SharkBite push fittings assorted", meta: "Tier 2", qty: "30 pcs", cond: "New", val: 270 },
    { name: 'Ball valve 3/4"', meta: "Tier 1", qty: "6 pcs", cond: "New", val: 72 },
    { name: 'Gate valve 1"', meta: "Tier 2", qty: "3 pcs", cond: "New", val: 90 },
    { name: "Pressure reducing valve", meta: "Watts · Tier 2", qty: "2 pcs", cond: "New", val: 130 },
  ],
  fixtures: [
    { name: "Kitchen faucet — brushed nickel", meta: "Moen Arbor · Tier 2", qty: "2 units", cond: "New", val: 580 },
    { name: "Bathroom faucet — chrome", meta: "Delta · Tier 1", qty: "3 units", cond: "New", val: 330 },
    { name: "Showerhead — rain + handheld", meta: "Kohler · Tier 2", qty: "2 units", cond: "New", val: 420 },
    { name: "Toilet — elongated 1.28gpf", meta: "Kohler Cimarron · Tier 1", qty: "3 units", cond: "New", val: 870 },
    { name: 'Bathtub — 60" alcove white', meta: "American Standard · Tier 1", qty: "1 unit", cond: "New", val: 480 },
    { name: 'Vanity — 36" white shaker', meta: "Tier 2", qty: "2 units", cond: "New", val: 960 },
    { name: "Utility sink — laundry", meta: "Tier 1", qty: "1 unit", cond: "New", val: 125 },
  ],
  "paint-int": [
    { name: "SW Emerald Eggshell — Extra White", meta: "Sherwin-Williams · Tier 2", qty: "12 gal", cond: "New", val: 768 },
    { name: "BM Regal Select Flat — White Dove", meta: "Benjamin Moore · Tier 2", qty: "8 gal", cond: "New", val: 560 },
    { name: "Zinsser BIN primer — white", meta: "Shellac-based · Tier 1", qty: "4 gal", cond: "New", val: 180 },
    { name: "Drywall primer — PVA", meta: "Glidden · Tier 1", qty: "5 gal", cond: "New", val: 110 },
    { name: 'Paint roller covers 9" — bulk', meta: '3/8" nap · Tier 1', qty: "24 pcs", cond: "New", val: 72 },
    { name: '9" roller frame', meta: "Wooster · Tier 1", qty: "6 pcs", cond: "New", val: 42 },
    { name: '2.5" angled sash brush', meta: "Purdy · Tier 2", qty: "8 pcs", cond: "New", val: 96 },
    { name: "Canvas drop cloth 9x12", meta: "Tier 1 — Bulk", qty: "10 pcs", cond: "New", val: 90 },
    { name: "Painters tape 2in blue", meta: "3M ScotchBlue · Tier 1", qty: "24 rolls", cond: "New", val: 96 },
    { name: "Paint tray liners", meta: "Tier 1 — Bulk", qty: "50 pcs", cond: "New", val: 25 },
    { name: "5-in-1 painter tool", meta: "Red Devil · Tier 1", qty: "6 pcs", cond: "New", val: 48 },
    { name: "Caulk — paintable white", meta: "DAP Alex Plus · Tier 1", qty: "24 tubes", cond: "New", val: 72 },
    { name: "Corner roller — foam", meta: "Tier 1", qty: "4 pcs", cond: "New", val: 16 },
    { name: "Extension pole 4-8ft", meta: "Shur-Line · Tier 1", qty: "4 pcs", cond: "New", val: 60 },
    { name: "TSP cleaner — pre-paint", meta: "Tier 1", qty: "4 boxes", cond: "New", val: 32 },
    { name: "Stir sticks — bulk", meta: "Tier 1", qty: "100 pcs", cond: "New", val: 15 },
  ],
  "paint-ext": [
    { name: "SW Duration Exterior Satin — Off White", meta: "Sherwin-Williams · Tier 2", qty: "5 gal", cond: "New", val: 425 },
    { name: "Exterior primer — oil-based", meta: "Tier 2", qty: "2 gal", cond: "New", val: 110 },
    { name: "Deck & porch enamel — grey", meta: "Behr Premium · Tier 2", qty: "2 gal", cond: "New", val: 130 },
    { name: "Solid wood stain — cedar tone", meta: "Cabot · Tier 2", qty: "2 gal", cond: "New", val: 90 },
  ],
  "power-tools": [
    { name: 'Circular saw 7.25" — DEWALT', meta: "DWE575 · Company owned", qty: "3 units", cond: "Good", val: 540 },
    { name: "Cordless drill/driver — DEWALT", meta: "20V MAX · Company owned", qty: "4 units", cond: "Good", val: 600 },
    { name: "Reciprocating saw — Milwaukee", meta: "FUEL · Company owned", qty: "2 units", cond: "Good", val: 480 },
    { name: "Jigsaw — Bosch", meta: "JS470E · Company owned", qty: "2 units", cond: "Good", val: 260 },
    { name: 'Angle grinder 4.5" — DEWALT', meta: "Company owned", qty: "2 units", cond: "Good", val: 180 },
    { name: "Brad nailer 18ga — DEWALT", meta: "Company owned", qty: "2 units", cond: "Good", val: 300 },
    { name: "Finish nailer 15ga — Bostitch", meta: "Company owned", qty: "2 units", cond: "Good", val: 380 },
    { name: "Shop vac 16gal — Ridgid", meta: "Company owned", qty: "3 units", cond: "Good", val: 450 },
    { name: "Air compressor 6gal — Bostitch", meta: "Pancake · Company owned", qty: "2 units", cond: "Good", val: 360 },
    { name: "Wet tile saw — QEP", meta: "Company owned", qty: "1 unit", cond: "Good", val: 350 },
    { name: "Router — DEWALT", meta: "DWP611PK · Company owned", qty: "1 unit", cond: "Good", val: 200 },
    { name: "Oscillating multi-tool — Milwaukee", meta: "Company owned", qty: "2 units", cond: "Good", val: 320 },
  ],
  "hand-tools": [
    { name: "Framing hammer 22oz — Estwing", meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", val: 240 },
    { name: 'Pry bar 24" — Stanley', meta: "Company owned", qty: "4 pcs", cond: "Good", val: 80 },
    { name: "Utility knife — Milwaukee", meta: "Company owned · Bulk", qty: "12 pcs", cond: "Good", val: 120 },
    { name: "4ft level — Empire", meta: "Company owned", qty: "3 pcs", cond: "Good", val: 135 },
    { name: "2ft torpedo level", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", val: 90 },
    { name: "Tape measure 25ft — DEWALT", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", val: 90 },
    { name: "Speed square — Swanson", meta: "Company owned · Bulk", qty: "4 pcs", cond: "Good", val: 40 },
    { name: "Chalk line — Stanley", meta: "Company owned", qty: "3 pcs", cond: "Good", val: 30 },
    { name: "Claw hammer 16oz — Stanley", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", val: 90 },
    { name: "Chisels set — Irwin", meta: "Company owned", qty: "3 sets", cond: "Good", val: 75 },
    { name: 'Drywall knife 6" — Rigid', meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", val: 64 },
    { name: "Tin snips — DEWALT", meta: "Company owned", qty: "3 pcs", cond: "Good", val: 75 },
    { name: "Wire stripper — Klein", meta: "Company owned", qty: "4 pcs", cond: "Good", val: 100 },
    { name: "Lineman pliers — Klein", meta: "Company owned", qty: "4 pcs", cond: "Good", val: 120 },
    { name: "Needle-nose pliers — Klein", meta: "Company owned · Bulk", qty: "6 pcs", cond: "Good", val: 90 },
    { name: "Hacksaw — Stanley", meta: "Company owned", qty: "3 pcs", cond: "Good", val: 45 },
    { name: "Miter box", meta: "Company owned", qty: "2 pcs", cond: "Good", val: 50 },
    { name: "Rubber mallet 32oz", meta: "Company owned", qty: "4 pcs", cond: "Good", val: 60 },
    { name: "Floor scraper", meta: "Company owned", qty: "4 pcs", cond: "Good", val: 80 },
    { name: "Caulk gun — Newborn", meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", val: 80 },
    { name: 'Putty knife 3" — Hyde', meta: "Company owned · Bulk", qty: "8 pcs", cond: "Good", val: 40 },
    { name: "Brick trowel — Marshalltown", meta: "Company owned", qty: "3 pcs", cond: "Good", val: 75 },
    { name: "Notched trowel 1/4x3/8", meta: "Company owned · Tiling", qty: "4 pcs", cond: "Good", val: 48 },
    { name: "Grout float", meta: "Company owned", qty: "4 pcs", cond: "Good", val: 40 },
    { name: "Sponge & bucket set", meta: "Tiling · Bulk", qty: "6 sets", cond: "Good", val: 48 },
    { name: "Mud mixing paddle", meta: "Company owned", qty: "2 pcs", cond: "Good", val: 30 },
    { name: "Staple gun — Arrow", meta: "Company owned", qty: "2 pcs", cond: "Good", val: 60 },
    { name: "Punch set — Irwin", meta: "Company owned", qty: "2 sets", cond: "Good", val: 30 },
  ],
  "safety-equip": [
    { name: "Safety glasses — bulk pack", meta: "ANSI Z87.1 · Tier 1", qty: "24 pcs", cond: "New", val: 48 },
    { name: "Ear protection — foam plugs", meta: "3M · NRR 33 · Bulk", qty: "200 pairs", cond: "New", val: 40 },
    { name: "N95 respirator — 3M 8210", meta: "NIOSH · Tier 1", qty: "40 pcs", cond: "New", val: 80 },
    { name: "Hard hat — white", meta: "MSA · Tier 1", qty: "8 pcs", cond: "New", val: 120 },
    { name: "Work gloves — leather palm", meta: "Mechanix · Tier 1 · Bulk", qty: "20 pairs", cond: "New", val: 200 },
    { name: "High-vis safety vest — orange", meta: "ANSI Class 2 · Bulk", qty: "12 pcs", cond: "New", val: 96 },
    { name: "Knee pads — ProKnee", meta: "Tier 2", qty: "6 pairs", cond: "New", val: 180 },
    { name: "First aid kit — 200 piece", meta: "OSHA compliant", qty: "2 kits", cond: "New", val: 90 },
    { name: "Caution tape — yellow", meta: "Bulk", qty: "10 rolls", cond: "New", val: 30 },
  ],
  ladders: [
    { name: "6ft fiberglass step ladder — Werner", meta: "Type IA · Company owned", qty: "3 units", cond: "Good", val: 480 },
    { name: "8ft aluminum step ladder — Louisville", meta: "Type I · Company owned", qty: "2 units", cond: "Good", val: 360 },
    { name: "24ft extension ladder — Werner", meta: "Type IA · Company owned", qty: "2 units", cond: "Good", val: 740 },
    { name: "Pump jack scaffolding set", meta: "Company owned · Full set", qty: "1 set", cond: "Good", val: 850 },
  ],
  "hvac-systems": [
    { name: "3-ton central AC unit — Carrier", meta: "16 SEER · Tier 2", qty: "1 unit", cond: "New", val: 2400 },
    { name: "2-ton central AC unit — Carrier", meta: "16 SEER · Tier 2", qty: "1 unit", cond: "New", val: 1950 },
    { name: "80k BTU gas furnace — Lennox", meta: "80% AFUE · Tier 2", qty: "1 unit", cond: "New", val: 1200 },
    { name: "Heat pump 3-ton — Trane", meta: "18 SEER · Tier 2", qty: "1 unit", cond: "New", val: 3100 },
  ],
  ductwork: [
    { name: '6" flex duct 25ft', meta: "Tier 1 — Bulk", qty: "8 rolls", cond: "New", val: 320 },
    { name: '8" flex duct 25ft', meta: "Tier 1", qty: "4 rolls", cond: "New", val: 240 },
    { name: '10" rigid duct 5ft', meta: "Galvanized · Tier 1", qty: "6 pcs", cond: "New", val: 150 },
    { name: "HVAC duct tape — silver", meta: "3M · Foil tape · Bulk", qty: "12 rolls", cond: "New", val: 120 },
    { name: "Duct insulation wrap R-6", meta: "Tier 1", qty: "4 rolls", cond: "New", val: 200 },
    { name: "Floor register 4x12 — white", meta: "Tier 1 — Bulk", qty: "16 pcs", cond: "New", val: 96 },
    { name: "Return air grille 14x20 — white", meta: "Tier 1", qty: "6 pcs", cond: "New", val: 90 },
    { name: 'Plenum box 12" round', meta: "Tier 1", qty: "4 pcs", cond: "New", val: 80 },
  ],
  thermostats: [
    { name: "Smart thermostat — Nest 4th gen", meta: "Google · Tier 2", qty: "3 units", cond: "New", val: 450 },
    { name: "Programmable thermostat — Honeywell", meta: "T6 Pro · Tier 1", qty: "2 units", cond: "New", val: 130 },
    { name: "Manual thermostat — Honeywell", meta: "T87 Round · Tier 1", qty: "1 unit", cond: "New", val: 35 },
    { name: "Thermostat wire 18/5 — 50ft", meta: "Tier 1", qty: "4 rolls", cond: "New", val: 80 },
    { name: "Thermostat sub-base", meta: "Tier 1", qty: "3 pcs", cond: "New", val: 30 },
    { name: "Thermostat cover plate", meta: "White · Tier 1 · Bulk", qty: "6 pcs", cond: "New", val: 18 },
  ],
  filters: [
    { name: "16x25x1 MERV 8 filter", meta: "Tier 1 — Bulk", qty: "24 pcs", cond: "New", val: 120 },
    { name: "20x20x1 MERV 8 filter", meta: "Tier 1 — Bulk", qty: "12 pcs", cond: "New", val: 72 },
    { name: "16x20x1 MERV 11 filter", meta: "Tier 2", qty: "12 pcs", cond: "New", val: 108 },
    { name: "20x25x4 MERV 11 — thick", meta: "Tier 2", qty: "6 pcs", cond: "New", val: 90 },
    { name: "Refrigerant R-410A — 25lb jug", meta: "Tier 2 · Licensed use only", qty: "2 jugs", cond: "New", val: 450 },
    { name: "Condensate drain pan tabs", meta: "Tier 1 — Bulk", qty: "100 pcs", cond: "New", val: 40 },
    { name: "HVAC coil cleaner spray", meta: "Nu-Calgon · Tier 1", qty: "6 cans", cond: "New", val: 60 },
    { name: "Blower motor lubricant", meta: "3-in-1 · Tier 1", qty: "6 tubes", cond: "New", val: 36 },
    { name: "Condensate pump — Little Giant", meta: "Tier 1", qty: "2 units", cond: "New", val: 80 },
    { name: "Duct sealant — mastic", meta: "Hardcast · Tier 1", qty: "4 gal", cond: "New", val: 120 },
    { name: "Drain line clear tabs", meta: "Tier 1 — Bulk", qty: "50 pcs", cond: "New", val: 25 },
    { name: "Wire brushes — HVAC", meta: "Assorted · Tier 1", qty: "4 sets", cond: "New", val: 48 },
  ],
  "kitchen-appl": [
    { name: 'Refrigerator 36" French door — Samsung', meta: "Tier 2 · SS finish", qty: "1 unit", cond: "New", val: 1850 },
    { name: 'Gas range 30" — GE', meta: "5-burner · Tier 2", qty: "1 unit", cond: "New", val: 1200 },
    { name: "Dishwasher built-in — Bosch", meta: "300 series · Tier 2", qty: "2 units", cond: "New", val: 1800 },
    { name: "Over-range microwave — GE", meta: "1.7 cu ft · Tier 1", qty: "2 units", cond: "New", val: 700 },
    { name: 'Range hood 30" — Broan', meta: "Tier 1", qty: "1 unit", cond: "New", val: 180 },
    { name: "Garbage disposal 1/2HP — InSinkErator", meta: "Badger 5 · Tier 1", qty: "3 units", cond: "New", val: 330 },
  ],
  laundry: [
    { name: "Washer top-load 4.5cu ft — Samsung", meta: "Tier 2", qty: "1 unit", cond: "New", val: 850 },
    { name: "Dryer electric 7.4cu ft — Samsung", meta: "Tier 2", qty: "1 unit", cond: "New", val: 800 },
    { name: 'Laundry tub sink — Fiat', meta: '24" · Tier 1', qty: "1 unit", cond: "New", val: 145 },
  ],
  "water-heaters": [
    { name: "40gal water heater gas — Rheem", meta: "Performance Plus · Tier 1", qty: "1 unit", cond: "New", val: 680 },
    { name: "Tankless water heater — Rinnai", meta: "V65eN natural gas · Tier 2", qty: "1 unit", cond: "New", val: 1100 },
  ],
};

type SeedTemplate = {
  name: string;
  isLocked: boolean;
  isDefault: boolean;
  scope: string;
  data: { fields: { name: string; type: string; required: boolean; options?: string[] }[] };
};

const TEMPLATES: SeedTemplate[] = [
  { name: "Standard kitchen appliance", isLocked: true, isDefault: false, scope: "kitchen-appl",
    data: { fields: [
      { name: "Brand", type: "text", required: true },
      { name: "Model", type: "text", required: true },
      { name: "Serial", type: "text", required: false },
      { name: "Tier", type: "select", required: true, options: ["Tier 1", "Tier 2"] },
      { name: "Value", type: "money", required: true },
    ]}},
  { name: "Bulk material", isLocked: true, isDefault: true, scope: "gen-flooring",
    data: { fields: [
      { name: "Description", type: "text", required: true },
      { name: "Quantity", type: "text", required: true },
      { name: "Tier", type: "select", required: true, options: ["Tier 1 — Bulk", "Tier 2 — Spec variant"] },
      { name: "Value", type: "money", required: true },
    ]}},
  { name: "Tool / equipment", isLocked: true, isDefault: false, scope: "power-tools",
    data: { fields: [
      { name: "Brand", type: "text", required: true },
      { name: "Model", type: "text", required: true },
      { name: "Condition", type: "select", required: true, options: ["New", "Good", "Fair", "Damaged"] },
      { name: "Replacement $", type: "money", required: true },
    ]}},
];

async function seedForCompany(companyId: string) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    throw new Error(`Company not found: ${companyId}`);
  }
  console.log(`[wh-seed] seeding warehouse for company "${company.name}" (${company.id})`);

  let depOrder = 0;
  let totalSubs = 0;
  let totalItems = 0;

  for (const d of WH_DEPARTMENTS) {
    const dep = await prisma.warehouseDepartment.upsert({
      where: { companyId_code: { companyId, code: d.code } },
      update: { name: d.name, icon: d.icon, order: depOrder, hidden: false },
      create: { companyId, code: d.code, name: d.name, icon: d.icon, order: depOrder },
    });
    depOrder++;

    let subOrder = 0;
    for (const s of d.subs) {
      const sub = await prisma.warehouseSubcategory.upsert({
        where: { departmentId_code: { departmentId: dep.id, code: s.code } },
        update: { name: s.name, order: subOrder, hidden: false },
        create: { departmentId: dep.id, code: s.code, name: s.name, order: subOrder },
      });
      subOrder++;
      totalSubs++;

      // Only seed prototype items into EMPTY subcategories so re-running
      // never destroys items the user added themselves. Pass --reset to
      // force a wipe+reseed (matches the original prisma/seed.ts behaviour).
      const existingItems = await prisma.warehouseItem.count({
        where: { subcategoryId: sub.id },
      });
      if (existingItems > 0 && !RESET_ITEMS) {
        continue;
      }
      if (RESET_ITEMS) {
        await prisma.warehouseItem.deleteMany({ where: { subcategoryId: sub.id } });
      }
      const items = WH_INVENTORY[s.code] || [];
      for (const it of items) {
        await prisma.warehouseItem.create({
          data: {
            subcategoryId: sub.id,
            name: it.name,
            notes: it.meta,
            unit: it.qty,
            condition: it.cond,
            value: String(it.val),
            qty: String(it.val),
            defaultCost: String(it.val),
          },
        });
        totalItems++;
      }
    }
  }

  let templatesAdded = 0;
  for (const t of TEMPLATES) {
    const exists = await prisma.warehouseTemplate.findFirst({
      where: { companyId, name: t.name },
    });
    if (!exists) {
      await prisma.warehouseTemplate.create({
        data: {
          companyId,
          name: t.name,
          isLocked: t.isLocked,
          isDefault: t.isDefault,
          scope: t.scope,
          data: t.data as Prisma.InputJsonValue,
        },
      });
      templatesAdded++;
    }
  }

  console.log(
    `[wh-seed] done: ${WH_DEPARTMENTS.length} departments, ${totalSubs} subcategories, ${totalItems} items, ${templatesAdded} new templates`
  );
}

const args = process.argv.slice(2);
const RESET_ITEMS = args.includes("--reset");
const positional = args.filter((a) => !a.startsWith("--"));

async function main() {
  const companyId = positional[0] || process.env.TARGET_COMPANY_ID;
  if (!companyId) {
    console.error("Usage: tsx seed-warehouse-for-company.ts <companyId> [--reset]");
    console.error("  --reset  also wipe + re-insert items in subcategories that already have items");
    process.exit(1);
  }
  await seedForCompany(companyId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
