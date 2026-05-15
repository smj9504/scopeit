import React, { useState, useMemo, useEffect, useCallback, memo, useRef } from 'react';
import {
  Camera, Settings, Plus, Trash2, Save, Download, Eye, X,
  Calculator, AlertTriangle, FileText, ChevronDown, ChevronUp,
  Loader, Check, Edit3, Copy, Sparkles,
  DollarSign, Search, PencilLine, MapPin, Users
} from 'lucide-react';

// ============================================
// API Configuration
// ============================================
const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:8002/api';

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

const api = {
  estimates: {
    create: (data) => apiRequest('/estimates/quick', { method: 'POST', body: JSON.stringify(data) }),
    save: (data) => apiRequest('/estimates/save', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/estimates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    list: (params) => apiRequest(`/estimates/?${new URLSearchParams(params)}`),
    get: (id) => apiRequest(`/estimates/${id}`),
    delete: (id) => apiRequest(`/estimates/${id}`, { method: 'DELETE' }),
  },
  photos: {
    analyze: (images) => apiRequest('/photos/analyze', { method: 'POST', body: JSON.stringify({ images }) }),
    analyzeAndEstimate: (images, options = {}) => {
      const params = new URLSearchParams({
        crew_size: options.crewSize || 4,
        storage_months: options.storageMonths || 1,
        include_packback: options.includePackback !== false,
        include_op: options.includeOp !== false,
        op_rate: options.opRate || 20,
        include_contingency: false,
        contingency_rate: 0,
      });
      return apiRequest(`/photos/analyze-and-estimate?${params}`, { method: 'POST', body: JSON.stringify({ images }) });
    },
    analyzeRoom: (roomName, images) => apiRequest('/photos/analyze-room', { method: 'POST', body: JSON.stringify({ room_name: roomName, images }) }),
    submitCorrections: (sessionId, roomName, corrections) => apiRequest('/photos/corrections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, room_name: roomName, corrections }) }),
    uploadRoomPhotos: (estimateId, rooms) => apiRequest('/photos/upload-room-photos', {
      method: 'POST',
      body: JSON.stringify({ estimate_id: estimateId, rooms }),
    }),
    getByEstimate: (estimateId) => apiRequest(`/photos/estimate/${estimateId}`),
    estimateFromRooms: (rooms, options = {}) => apiRequest('/photos/rooms-estimate', {
      method: 'POST',
      body: JSON.stringify({
        rooms: rooms.map(r => ({
          room_name: r.name,
          preset_id: r.presetId || null,
          items: r.items.map(i => ({
            name: i.name, category: i.category, quantity: i.quantity,
            is_high_value: i.isHighValue || false, estimated_value: i.estimatedValue || null,
            is_fragile: i.isFrag || i.is_fragile || false,
            needs_disassembly: i.needsDisassembly || i.needs_disassembly || false,
            packing_method: i.packingMethod || i.packing_method || null,
            required_materials: i.requiredMaterials || i.required_materials || null,
            estimated_labor_hours: i.estimatedLaborHours || i.estimated_labor_hours || null,
            special_instructions: i.specialInstructions || i.special_instructions || null,
            estimator_flags: i.estimatorFlags || i.estimator_flags || null,
          })),
          density: r.density || 'normal',
          floor: r.floor || '1st',
          contamination: r.contamination || 'clean',
        })),
        crew_size: options.crewSize || 4,
        storage_months: options.storageMonths || 0,
        staging_type: options.stagingType || 'off_site',
        include_packback: options.includePackback !== false,
        include_op: options.includeOp !== false,
        op_rate: options.opRate || 20,
        include_contingency: false,
        contingency_rate: 0,
        region: options.region || 'midwest',
        special_items: options.specialItems || [],
      }),
    }),
  },
  prices: {
    getAll: () => apiRequest('/prices/'),
    getByCategory: () => apiRequest('/prices/by-category'),
    create: (data) => apiRequest('/prices/', { method: 'POST', body: JSON.stringify(data) }),
    update: (code, data) => apiRequest(`/prices/${code}`, { method: 'PUT', body: JSON.stringify(data) }),
  },
  settings: {
    getCompany: () => apiRequest('/settings/company'),
    saveCompany: (data) => apiRequest('/settings/company', { method: 'PUT', body: JSON.stringify(data) }),
    getPhoto: () => apiRequest('/settings/photo'),
    savePhoto: (data) => apiRequest('/settings/photo', { method: 'PUT', body: JSON.stringify(data) }),
  },
  export: {
    pdf: async (data, meta = {}) => {
      const response = await fetch(`${API_BASE}/export/direct/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimate_data: data,
          client_name: meta.clientName || null,
          client_phone: meta.clientPhone || null,
          client_email: meta.clientEmail || null,
          property_address: meta.propertyAddress || null,
          notes: meta.notes || null,
          company_info: meta.companyInfo || null,
          estimate_number: meta.estimateNumber || null,
          tax_rate: meta.taxRate || 0,
          area_breakdown: meta.areaBreakdown || null,
        }),
      });
      return response.blob();
    },
    excel: async (data, meta = {}) => {
      const response = await fetch(`${API_BASE}/export/direct/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estimate_data: data,
          client_name: meta.clientName || null,
          client_phone: meta.clientPhone || null,
          client_email: meta.clientEmail || null,
          property_address: meta.propertyAddress || null,
          notes: meta.notes || null,
          company_info: meta.companyInfo || null,
          estimate_number: meta.estimateNumber || null,
          tax_rate: meta.taxRate || 0,
        }),
      });
      return response.blob();
    },
  },
};

// ============================================
// CONSTANTS & DEFAULTS
// ============================================
const DEFAULT_PRICES = {
  labor: 57.31, labor_fragile: 87.14, labor_specialty: 124.02, supervisor: 87.14,
  box_small: 2.95, box_medium: 3.91, box_large: 5.28, box_dish: 9.98,
  box_wardrobe: 18.48, box_wardrobe_small: 16.01, box_wardrobe_large: 27.89,
  box_mirror: 10.29, blanket: 18.26, shrink_wrap: 29.83,
  bubble_12: 11.00, packing_paper: 18.00,
  chair_cover: 5.31, sofa_cover: 8.57, furniture_pad: 9.07,
  truck_26: 197.36, truck_20: 179.25, truck_15: 172.36, storage_sf: 2.18,
};

// Standard self-storage unit sizes (5x5, 5x10, 10x10, 10x15, 10x20, 10x25, 10x30)
const STANDARD_UNIT_SIZES = [25, 50, 100, 150, 200, 250, 300];
const snapToStorageUnit = (rawSf) => {
  for (const size of STANDARD_UNIT_SIZES) { if (rawSf <= size) return size; }
  return STANDARD_UNIT_SIZES[STANDARD_UNIT_SIZES.length - 1];
};

// SF per room size for storage calculation (matches backend)
const SF_PER_ROOM_SIZE = { small: 15, large: 40, xlarge: 70 };
// Cubic feet per room size for truck load calculation (packed boxes, not furniture moves)
// small: bathroom/closet ~60 cu ft, large: bedroom/living ~150 cu ft, xlarge: master/garage ~250 cu ft
// 26-ft truck capacity ≈ 1,500 cu ft → typical job (4–8 rooms) fits in 1 truck
const CF_PER_ROOM_SIZE = { small: 60, large: 150, xlarge: 250 };
const TRUCK_CAPACITY_CF = 1500;
// Room-size-based material volume scale — matches backend MAT_SCALE_PER_SIZE.
// Replaces baseItems in material calculations; density multiplier applied on top.
const MAT_SCALE_PER_SIZE = { small: 30, large: 80, xlarge: 120 };
const DENSITY_MULT = { light: 0.7, normal: 1.0, dense: 1.3, heavy: 1.6, extreme: 2.5 };
// Multipliers for effective hours — matches backend calculator.py
const FLOOR_MULT  = { basement: 1.1, '1st': 1.0, '2nd': 1.15, '3rd': 1.25, '4th+': 1.40 };
const CONTAM_MULT = { clean: 1.0, gray_water: 1.4, black_water: 1.8 };
// Labor slowdown per hint (use max across hints, not cumulative) — matches backend HINT_LABOR_MULTIPLIERS
const HINT_LABOR_MULT = {
  fragile: 1.40, artwork: 1.50, instruments: 1.50, valuables: 1.20,
  wine_collection: 1.50, lamps_lighting: 1.30, bicycles: 1.20,
  holiday_decor: 1.20, collectibles: 1.30, equipment_heavy: 1.15,
};
// Compute effective hours for a single room (preset base × all multipliers)
const roomEffectiveHours = r => {
  const hintM = r.hints.reduce((mx, h) => Math.max(mx, HINT_LABOR_MULT[h] || 1.0), 1.0);
  return r.hours
    * (DENSITY_MULT[r.density] || 1.0)
    * (FLOOR_MULT[r.floor]    || 1.0)
    * (CONTAM_MULT[r.contamination] || 1.0)
    * hintM;
};

// Storage setup fee by unit size — scales with unit size (power-law ^0.65, base $85 for 10x10)
// Covers: shelving, inventory placement, padlock
const STORAGE_SETUP_BY_SIZE = { 25: 42, 50: 54, 100: 85, 150: 109, 200: 131, 250: 152, 300: 172 };
const getStorageSetupFee = (unitSf) => STORAGE_SETUP_BY_SIZE[unitSf] || 85;

// ============================================
// NEW: Region, Contamination, Special Items
// ============================================
const REGION_OPTIONS = [
  { value: 'mid_atlantic', label: 'Mid-Atlantic (Baseline)', mult: 1.00 },
  { value: 'northeast',    label: 'Northeast  (+15%)',       mult: 1.15 },
  { value: 'west',         label: 'West  (+5%)',             mult: 1.05 },
  { value: 'midwest',      label: 'Midwest  (-10%)',         mult: 0.90 },
  { value: 'southwest',    label: 'Southwest  (-15%)',       mult: 0.85 },
  { value: 'southeast',    label: 'Southeast  (-20%)',       mult: 0.80 },
];

// US state abbreviation → region
const STATE_TO_REGION = {
  // Mid-Atlantic (NOVA/DC area — baseline calibration)
  DC: 'mid_atlantic', DE: 'mid_atlantic', MD: 'mid_atlantic', VA: 'mid_atlantic',
  // Northeast
  CT: 'northeast', MA: 'northeast', ME: 'northeast', NH: 'northeast',
  NJ: 'northeast', NY: 'northeast', PA: 'northeast', RI: 'northeast', VT: 'northeast',
  // Southeast
  AL: 'southeast', AR: 'southeast', FL: 'southeast', GA: 'southeast',
  KY: 'southeast', LA: 'southeast', MS: 'southeast', NC: 'southeast',
  SC: 'southeast', TN: 'southeast', WV: 'southeast',
  // Midwest
  IA: 'midwest', IL: 'midwest', IN: 'midwest', KS: 'midwest',
  MI: 'midwest', MN: 'midwest', MO: 'midwest', ND: 'midwest',
  NE: 'midwest', OH: 'midwest', SD: 'midwest', WI: 'midwest',
  // Southwest
  AZ: 'southwest', NM: 'southwest', NV: 'southwest', OK: 'southwest',
  TX: 'southwest', UT: 'southwest',
  // West
  AK: 'west', CA: 'west', CO: 'west', HI: 'west',
  ID: 'west', MT: 'west', OR: 'west', WA: 'west', WY: 'west',
};

function regionFromAddress(address) {
  if (!address) return null;
  // Match 2-letter uppercase state codes (with optional ZIP)
  const tokens = address.toUpperCase().replace(/[,]/g, ' ').split(/\s+/);
  // Scan from end — state abbreviation is usually near the end
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].replace(/\d/g, '').trim();
    if (t.length === 2 && STATE_TO_REGION[t]) return STATE_TO_REGION[t];
  }
  return null;
}

const CONTAMINATION_OPTIONS = [
  { value: 'clean',       label: 'Clean / Dry',        mult: 1.0 },
  { value: 'gray_water',  label: 'Gray Water  (+40%)', mult: 1.4 },
  { value: 'black_water', label: 'Black Water (+80%)', mult: 1.8 },
];

const SPECIAL_ITEMS_OPTIONS = [
  { value: 'piano',      label: 'Piano',      price: 450 },
  { value: 'pool_table', label: 'Pool Table', price: 385 },
  { value: 'gun_safe',   label: 'Gun Safe',   price: 275 },
];

// Room Presets (28 types) organized by category
const ROOM_PRESETS = {
  bedroom: [
    { id: 'bedroom_standard',  name: 'Standard Bedroom',  size: 'large',  baseItems: 80,  hours: 3.5, defaultHints: ['bed_small', 'dresser', 'clothing_folded', 'electronics'],                                    suggestedHints: ['bed_large', 'clothing_hanging', 'bedding', 'books', 'artwork', 'lamps_lighting', 'valuables', 'furniture'] },
    { id: 'bedroom_kids',      name: 'Kids Bedroom',       size: 'large',  baseItems: 100, hours: 4,   defaultHints: ['bed_small', 'clothing_folded', 'toys', 'books'],                                            suggestedHints: ['dresser', 'clothing_hanging', 'bedding', 'sports', 'instruments', 'electronics', 'furniture'] },
    { id: 'bedroom_guest',     name: 'Guest Bedroom',      size: 'large',  baseItems: 50,  hours: 2.5, defaultHints: ['bed_small', 'dresser', 'clothing_folded'],                                                   suggestedHints: ['bed_large', 'clothing_hanging', 'bedding', 'books', 'artwork', 'lamps_lighting', 'furniture'] },
    { id: 'bedroom_master',    name: 'Master Bedroom',     size: 'xlarge', baseItems: 120, hours: 5,   defaultHints: ['bed_large', 'dresser', 'clothing_hanging', 'clothing_folded', 'electronics', 'artwork'],     suggestedHints: ['wardrobe', 'bedding', 'valuables', 'collectibles', 'lamps_lighting', 'rugs', 'furniture'] },
  ],
  kitchen: [
    { id: 'kitchen_standard',  name: 'Standard Kitchen',   size: 'large',  baseItems: 150, hours: 6,   defaultHints: ['kitchenware', 'fragile', 'appliances_small'],                                               suggestedHints: ['appliances_large', 'collectibles', 'wine_collection', 'chemicals'] },
    { id: 'kitchen_chef',      name: 'Chefs Kitchen',      size: 'xlarge', baseItems: 200, hours: 8,   defaultHints: ['kitchenware', 'fragile', 'appliances_small', 'appliances_large', 'collectibles'],           suggestedHints: ['wine_collection', 'chemicals', 'tools', 'artwork'] },
    { id: 'kitchen_china',     name: 'Fine China Kitchen', size: 'large',  baseItems: 180, hours: 7,   defaultHints: ['kitchenware', 'fragile', 'collectibles', 'artwork'],                                         suggestedHints: ['appliances_small', 'wine_collection', 'lamps_lighting'] },
  ],
  living: [
    { id: 'living_standard',       name: 'Living Room',        size: 'large',  baseItems: 100, hours: 5,   defaultHints: ['sofa', 'coffee_table', 'electronics', 'artwork'],                    suggestedHints: ['loveseat', 'armchair', 'bookcase', 'books', 'collectibles', 'rugs', 'lamps_lighting', 'plants', 'instruments'] },
    { id: 'living_entertainment',  name: 'Entertainment Room', size: 'xlarge', baseItems: 130, hours: 6,   defaultHints: ['sofa', 'electronics', 'collectibles'],                              suggestedHints: ['loveseat', 'armchair', 'coffee_table', 'books', 'instruments', 'rugs', 'artwork', 'lamps_lighting'] },
    { id: 'dining_standard',       name: 'Dining Room',        size: 'large',  baseItems: 60,  hours: 3,   defaultHints: ['dining_table', 'dining_chair', 'fragile', 'artwork'],               suggestedHints: ['bookcase', 'collectibles', 'lamps_lighting', 'rugs', 'wine_collection'] },
  ],
  office: [
    { id: 'office_standard',  name: 'Home Office',         size: 'large',  baseItems: 80,  hours: 3.5, defaultHints: ['desk', 'electronics', 'books'],                               suggestedHints: ['bookcase', 'armchair', 'documents', 'collectibles', 'artwork', 'lamps_lighting', 'valuables'] },
    { id: 'office_library',   name: 'Library / Study',     size: 'xlarge', baseItems: 150, hours: 5,   defaultHints: ['bookcase', 'desk', 'books', 'collectibles', 'artwork'],        suggestedHints: ['armchair', 'documents', 'electronics', 'instruments', 'lamps_lighting'] },
    { id: 'office_tech',      name: 'Tech Heavy Office',   size: 'xlarge', baseItems: 100, hours: 4,   defaultHints: ['desk', 'electronics', 'equipment_heavy'],                     suggestedHints: ['bookcase', 'books', 'documents', 'collectibles'] },
  ],
  storage: [
    { id: 'basement_unfinished',  name: 'Basement (Unfinished)', size: 'xlarge', baseItems: 100, hours: 6, defaultHints: ['boxes_stored', 'tools', 'equipment_heavy'],                    suggestedHints: ['holiday_decor', 'sports', 'bicycles', 'clothing_folded', 'appliances_large'] },
    { id: 'basement_finished',    name: 'Basement (Finished)',   size: 'xlarge', baseItems: 150, hours: 7, defaultHints: ['sofa', 'electronics', 'boxes_stored', 'sports'],               suggestedHints: ['bookcase', 'coffee_table', 'tools', 'equipment_heavy', 'holiday_decor', 'instruments', 'bicycles'] },
    { id: 'garage',               name: 'Garage',                size: 'xlarge', baseItems: 80,  hours: 5, defaultHints: ['tools', 'sports', 'equipment_heavy', 'boxes_stored'],           suggestedHints: ['bicycles', 'outdoor_furniture', 'chemicals', 'holiday_decor'] },
    { id: 'attic',                name: 'Attic',                 size: 'large',  baseItems: 60,  hours: 3, defaultHints: ['boxes_stored', 'clothing_folded'],                              suggestedHints: ['holiday_decor', 'instruments', 'artwork', 'equipment_heavy', 'clothing_hanging'] },
  ],
  small: [
    { id: 'bathroom',          name: 'Bathroom',           size: 'small', baseItems: 30, hours: 1,   defaultHints: ['fragile'],                                                         suggestedHints: ['chemicals', 'electronics', 'collectibles', 'appliances_small'] },
    { id: 'closet_walkin',     name: 'Walk-in Closet',     size: 'small', baseItems: 70, hours: 2.5, defaultHints: ['clothing_hanging', 'clothing_folded'],                               suggestedHints: ['bedding', 'valuables', 'boxes_stored', 'collectibles'] },
    { id: 'closet_standard',   name: 'Standard Closet',    size: 'small', baseItems: 35, hours: 1,   defaultHints: ['clothing_folded'],                                                  suggestedHints: ['bedding', 'boxes_stored', 'clothing_hanging'] },
    { id: 'laundry',           name: 'Laundry Room',       size: 'small', baseItems: 25, hours: 1.5, defaultHints: ['appliances_large'],                                                 suggestedHints: ['chemicals', 'boxes_stored', 'appliances_small'] },
    { id: 'entryway',          name: 'Entryway / Mudroom', size: 'small', baseItems: 20, hours: 1,   defaultHints: ['clothing_folded'],                                                  suggestedHints: ['sports', 'armchair', 'electronics'] },
  ],
  specialty: [
    { id: 'gym',   name: 'Home Gym',    size: 'xlarge', baseItems: 40, hours: 3, defaultHints: ['equipment_heavy', 'sports'],                              suggestedHints: ['tools', 'electronics', 'bicycles'] },
    { id: 'music', name: 'Music Room',  size: 'large',  baseItems: 50, hours: 3, defaultHints: ['instruments', 'electronics', 'bookcase', 'armchair'],     suggestedHints: ['collectibles', 'artwork', 'books', 'equipment_heavy'] },
  ],
  outdoor: [
    { id: 'outdoor_patio',            name: 'Patio / Deck',      size: 'large',  baseItems: 40,  hours: 2.5, defaultHints: ['outdoor_furniture', 'equipment_heavy'],                    suggestedHints: ['plants', 'sports', 'bicycles', 'chemicals'] },
    { id: 'outdoor_shed',             name: 'Shed',              size: 'large',  baseItems: 60,  hours: 3,   defaultHints: ['tools', 'equipment_heavy', 'boxes_stored'],              suggestedHints: ['sports', 'bicycles', 'chemicals', 'holiday_decor', 'outdoor_furniture'] },
    { id: 'outdoor_garage_detached',  name: 'Detached Garage',   size: 'xlarge', baseItems: 120, hours: 5,   defaultHints: ['tools', 'sports', 'equipment_heavy', 'boxes_stored'],   suggestedHints: ['bicycles', 'chemicals', 'outdoor_furniture', 'holiday_decor'] },
  ],
};

const ROOM_CATEGORIES = [
  { id: 'bedroom', name: 'Bedroom', icon: 'bed' },
  { id: 'kitchen', name: 'Kitchen', icon: 'chef' },
  { id: 'living', name: 'Living', icon: 'sofa' },
  { id: 'office', name: 'Office', icon: 'briefcase' },
  { id: 'storage', name: 'Storage', icon: 'box' },
  { id: 'small', name: 'Small Rooms', icon: 'door' },
  { id: 'specialty', name: 'Specialty', icon: 'star' },
  { id: 'outdoor', name: 'Outdoor', icon: 'tree' },
  { id: 'custom', name: '+ Custom', icon: 'plus' },
];

// Size presets for custom rooms — mapped to a generic backend preset for calculation
const CUSTOM_SIZE_OPTIONS = [
  { value: 'small',  label: 'Small',  sub: 'Bathroom / Closet',      presetId: 'bathroom',          baseItems: 35,  hours: 0.5, size: 'small'  },
  { value: 'large',  label: 'Medium', sub: 'Bedroom / Office',        presetId: 'bedroom_standard',   baseItems: 100, hours: 1.5, size: 'large'  },
  { value: 'xlarge', label: 'Large',  sub: 'Living Room / Garage',    presetId: 'bedroom_master',     baseItems: 150, hours: 2.5, size: 'xlarge' },
];

// Content Hints (29 types) grouped by category
const CONTENT_HINTS = {
  // Clothing & Textiles
  clothing_hanging:  { name: 'Hanging Clothes',      category: 'Clothing & Textiles',  materials: { box_wardrobe: 0.05 } },
  clothing_folded:   { name: 'Folded Clothes',        category: 'Clothing & Textiles',  materials: { box_medium: 0.06 } },
  bedding:           { name: 'Bedding / Linens',      category: 'Clothing & Textiles',  materials: { box_large: 0.05, box_xlarge: 0.02 } },
  // Books & Media
  books:             { name: 'Books / Media',         category: 'Books & Media',        materials: { box_small: 0.1, box_book: 0.05 } },
  documents:         { name: 'Documents / Files',     category: 'Books & Media',        materials: { box_small: 0.05, box_medium: 0.02 } },
  // Electronics
  electronics:       { name: 'Electronics',           category: 'Electronics',          materials: { box_medium: 0.04, box_tv: 0.02, bubble_12: 0.01 } },
  // Kitchen
  kitchenware:       { name: 'Kitchenware',           category: 'Kitchen',              materials: { box_dish: 0.04, box_medium: 0.05, packing_paper: 0.02 } },
  // Fragile & Valuables
  fragile:           { name: 'Fragile Items',         category: 'Fragile & Valuables',  materials: { box_dish: 0.05, packing_paper: 0.02, bubble_12: 0.01 } },
  artwork:           { name: 'Artwork / Mirrors',     category: 'Fragile & Valuables',  materials: { box_mirror: 0.03, corner_protector: 0.02, bubble_12: 0.01 } },
  collectibles:      { name: 'Collectibles',          category: 'Fragile & Valuables',  materials: { box_small: 0.06, bubble_12: 0.02, packing_paper: 0.02 } },
  valuables:         { name: 'Jewelry / Valuables',   category: 'Fragile & Valuables',  materials: { box_small: 0.02, bubble_24: 0.01, packing_paper: 0.01 } },
  wine_collection:   { name: 'Wine Collection',       category: 'Fragile & Valuables',  materials: { box_small: 0.04, bubble_12: 0.02, packing_paper: 0.02 } },
  // Furniture — specific items (unit-based, use qty chips)
  sofa:              { name: 'Sofa / Sectional',      category: 'Furniture',            materials: {} },
  loveseat:          { name: 'Loveseat',              category: 'Furniture',            materials: {} },
  armchair:          { name: 'Armchair',              category: 'Furniture',            materials: {} },
  bed_large:         { name: 'King / Queen Bed',      category: 'Furniture',            materials: {} },
  bed_small:         { name: 'Twin / Full Bed',       category: 'Furniture',            materials: {} },
  dresser:           { name: 'Dresser / Chest',       category: 'Furniture',            materials: {} },
  wardrobe:          { name: 'Wardrobe / Armoire',    category: 'Furniture',            materials: {} },
  dining_table:      { name: 'Dining Table',          category: 'Furniture',            materials: {} },
  dining_chair:      { name: 'Dining Chairs',         category: 'Furniture',            materials: {} },
  coffee_table:      { name: 'Coffee Table',          category: 'Furniture',            materials: {} },
  bookcase:          { name: 'Bookcase / Shelf',      category: 'Furniture',            materials: {} },
  desk:              { name: 'Desk',                  category: 'Furniture',            materials: {} },
  // Furniture — general catch-all
  furniture:         { name: 'Other Furniture',       category: 'Furniture',            materials: { blanket: 0.08, shrink_wrap: 0.02, furniture_pad: 0.05, chair_cover: 0.04, sofa_cover: 0.02 } },
  rugs:              { name: 'Rugs / Carpets',        category: 'Furniture',            materials: { shrink_wrap: 0.03, blanket: 0.02 } },
  lamps_lighting:    { name: 'Lamps / Lighting',      category: 'Furniture',            materials: { box_lamp: 0.04, bubble_12: 0.01 } },
  // Appliances
  appliances_small:  { name: 'Small Appliances',      category: 'Appliances',           materials: { box_medium: 0.04, bubble_12: 0.01 } },
  appliances_large:  { name: 'Large Appliances',      category: 'Appliances',           materials: { blanket: 0.1, shrink_wrap: 0.03 } },
  // Recreation
  toys:              { name: 'Toys / Games',          category: 'Recreation',           materials: { box_large: 0.05, box_medium: 0.04 } },
  sports:            { name: 'Sports Equipment',      category: 'Recreation',           materials: { box_large: 0.03, blanket: 0.04 } },
  bicycles:          { name: 'Bicycles / Scooters',   category: 'Recreation',           materials: { blanket: 0.05, shrink_wrap: 0.02 } },
  // Tools & Equipment
  tools:             { name: 'Tools / Hardware',      category: 'Tools & Equipment',    materials: { box_small: 0.06, blanket: 0.02 } },
  equipment_heavy:   { name: 'Heavy Equipment',       category: 'Tools & Equipment',    materials: { blanket: 0.08, shrink_wrap: 0.03 } },
  // Storage
  boxes_stored:      { name: 'Stored Boxes',          category: 'Storage',              materials: { shrink_wrap: 0.02 } },
  holiday_decor:     { name: 'Holiday / Seasonal',    category: 'Storage',              materials: { box_medium: 0.05, box_large: 0.03, packing_paper: 0.01, bubble_12: 0.01 } },
  // Music & Arts
  instruments:       { name: 'Musical Instruments',  category: 'Music & Arts',         materials: { blanket: 0.1, bubble_12: 0.03 } },
  // Specialty
  baby_items:        { name: 'Baby / Nursery',        category: 'Specialty',            materials: { box_medium: 0.04, box_large: 0.03, blanket: 0.02 } },
  outdoor_furniture: { name: 'Outdoor Furniture',     category: 'Specialty',            materials: { blanket: 0.06, shrink_wrap: 0.03, furniture_pad: 0.03 } },
  plants:            { name: 'Plants / Pots',         category: 'Specialty',            materials: { box_large: 0.02 } },
  chemicals:         { name: 'Cleaning / Chemicals',  category: 'Specialty',            materials: { box_small: 0.03 } },
};

// Hints that are counted by unit (not scaled by baseItems)
// Materials here are per-unit absolute quantities, not factors
const HINT_UNIT_MATERIALS = {
  // Furniture — per piece
  sofa:             { sofa_cover: 1, blanket: 2, shrink_wrap: 1 },   // sofa / sectional
  loveseat:         { sofa_cover: 1, blanket: 1 },                   // loveseat
  armchair:         { chair_cover: 1, blanket: 1 },                  // armchair / accent chair
  bed_large:        { blanket: 2, shrink_wrap: 1, furniture_pad: 1 }, // king / queen frame
  bed_small:        { blanket: 1, shrink_wrap: 1 },                   // twin / full frame
  dresser:          { blanket: 2, shrink_wrap: 1, furniture_pad: 1 }, // dresser / chest
  wardrobe:         { blanket: 3, shrink_wrap: 1, furniture_pad: 2 }, // wardrobe / armoire
  dining_table:     { blanket: 2, furniture_pad: 2 },                 // dining table
  dining_chair:     { chair_cover: 1 },                               // per dining chair
  coffee_table:     { blanket: 1, furniture_pad: 1 },                 // coffee / side table
  bookcase:         { blanket: 1, furniture_pad: 1 },                 // bookcase / shelving unit
  desk:             { blanket: 2, furniture_pad: 1 },                 // desk / writing table
  // Appliances — per unit
  appliances_large: { blanket: 2, shrink_wrap: 1 },        // fridge, washer, dryer — 1 each
  appliances_small: { box_medium: 1, bubble_12: 1 },        // microwave, coffee maker — 1 each
  // Clothing — per box
  clothing_hanging: { box_wardrobe: 1 },                    // per wardrobe box (~24 hanging items)
  clothing_folded:  { box_medium: 1 },                      // per box of folded clothes
  // Other countables
  bicycles:         { blanket: 1, shrink_wrap: 1 },         // per bike/scooter
  instruments:      { blanket: 2, bubble_12: 1 },           // per instrument
};

// Quantity chip options: display label → numeric value for calculation
const QTY_CHIPS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 6 },
];

// Volume levels for factor-based hints: S/M/L/XL with descriptive labels + box counts + multipliers
// Index 1 (M) is the default. mult is applied to volScale in calculatedMaterials.
const HINT_VOLUME_LEVELS = {
  bedding:          [{ key:'S', label:'1-2 sets',         hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'3-5 sets',           hint:'~4 boxes',  mult:1.0 }, { key:'L', label:'6-10 sets',         hint:'~7 boxes',  mult:1.8 }, { key:'XL', label:'Full household',   hint:'~12 boxes', mult:3.0 }],
  books:            [{ key:'S', label:'1-2 shelves',       hint:'~5 boxes',  mult:0.4 }, { key:'M', label:'3-5 shelves',        hint:'~12 boxes', mult:1.0 }, { key:'L', label:'Full bookcase',      hint:'~20 boxes', mult:1.8 }, { key:'XL', label:'Library-level',    hint:'~35 boxes', mult:3.0 }],
  documents:        [{ key:'S', label:'One drawer',        hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'2-3 cabinets',       hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'Full office files',  hint:'~10 boxes', mult:1.8 }, { key:'XL', label:'Archive-level',    hint:'~18 boxes', mult:3.0 }],
  electronics:      [{ key:'S', label:'Few devices',       hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'Moderate setup',     hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'Heavy AV setup',     hint:'~9 boxes',  mult:1.8 }, { key:'XL', label:'Full AV/studio',   hint:'~15 boxes', mult:3.0 }],
  kitchenware:      [{ key:'S', label:'Basics only',       hint:'~4 boxes',  mult:0.4 }, { key:'M', label:'Standard kitchen',   hint:'~10 boxes', mult:1.0 }, { key:'L', label:'Well-stocked',       hint:'~18 boxes', mult:1.8 }, { key:'XL', label:"Chef's kitchen",   hint:'~30 boxes', mult:3.0 }],
  fragile:          [{ key:'S', label:'A few pieces',      hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'Moderate',           hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'Many items',         hint:'~10 boxes', mult:1.8 }, { key:'XL', label:'Extensive',        hint:'~18 boxes', mult:3.0 }],
  artwork:          [{ key:'S', label:'1-3 pieces',        hint:'~1 crate',  mult:0.4 }, { key:'M', label:'4-10 pieces',        hint:'~3 crates', mult:1.0 }, { key:'L', label:'11-25 pieces',       hint:'~7 crates', mult:1.8 }, { key:'XL', label:'Gallery-level',    hint:'~15 crates',mult:3.0 }],
  collectibles:     [{ key:'S', label:'Small display',     hint:'~3 boxes',  mult:0.4 }, { key:'M', label:'One cabinet',        hint:'~8 boxes',  mult:1.0 }, { key:'L', label:'Multi-cabinet',      hint:'~15 boxes', mult:1.8 }, { key:'XL', label:'Full collection',  hint:'~25 boxes', mult:3.0 }],
  valuables:        [{ key:'S', label:'A few items',       hint:'~1 box',    mult:0.4 }, { key:'M', label:'Moderate',           hint:'~2 boxes',  mult:1.0 }, { key:'L', label:'Large collection',   hint:'~4 boxes',  mult:1.8 }, { key:'XL', label:'Extensive',        hint:'~8 boxes',  mult:3.0 }],
  wine_collection:  [{ key:'S', label:'1-2 cases',         hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'3-8 cases',          hint:'~6 boxes',  mult:1.0 }, { key:'L', label:'9-20 cases',         hint:'~15 boxes', mult:1.8 }, { key:'XL', label:'Full cellar',      hint:'~30 boxes', mult:3.0 }],
  furniture:        [{ key:'S', label:'Few pieces',        hint:'~2 pads',   mult:0.4 }, { key:'M', label:'Moderate',           hint:'~5 pads',   mult:1.0 }, { key:'L', label:'Many pieces',        hint:'~9 pads',   mult:1.8 }, { key:'XL', label:'Full room+',       hint:'~15 pads',  mult:3.0 }],
  rugs:             [{ key:'S', label:'1-2 small',         hint:'~1 roll',   mult:0.4 }, { key:'M', label:'2-4 area rugs',      hint:'~3 rolls',  mult:1.0 }, { key:'L', label:'5-8 rugs',           hint:'~6 rolls',  mult:1.8 }, { key:'XL', label:'Whole-house',      hint:'~10 rolls', mult:3.0 }],
  lamps_lighting:   [{ key:'S', label:'1-2 lamps',         hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'3-5 lamps',          hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'6-10 lamps',         hint:'~9 boxes',  mult:1.8 }, { key:'XL', label:'10+ lamps',        hint:'~15 boxes', mult:3.0 }],
  toys:             [{ key:'S', label:'Small bin',         hint:'~3 boxes',  mult:0.4 }, { key:'M', label:'One room',           hint:'~8 boxes',  mult:1.0 }, { key:'L', label:'Large play area',    hint:'~15 boxes', mult:1.8 }, { key:'XL', label:'Full playroom',    hint:'~25 boxes', mult:3.0 }],
  sports:           [{ key:'S', label:'Few items',         hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'Moderate gear',      hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'Full gear set',      hint:'~10 boxes', mult:1.8 }, { key:'XL', label:'Pro-level',        hint:'~18 boxes', mult:3.0 }],
  tools:            [{ key:'S', label:'Basic toolbox',     hint:'~3 boxes',  mult:0.4 }, { key:'M', label:'Workshop set',       hint:'~8 boxes',  mult:1.0 }, { key:'L', label:'Full workshop',      hint:'~15 boxes', mult:1.8 }, { key:'XL', label:'Pro workshop',     hint:'~25 boxes', mult:3.0 }],
  equipment_heavy:  [{ key:'S', label:'1-2 items',         hint:'~2 pads',   mult:0.4 }, { key:'M', label:'3-5 items',          hint:'~5 pads',   mult:1.0 }, { key:'L', label:'6-10 items',         hint:'~9 pads',   mult:1.8 }, { key:'XL', label:'10+ items',        hint:'~15 pads',  mult:3.0 }],
  boxes_stored:     [{ key:'S', label:'5-10 boxes',        hint:'~8 boxes',  mult:0.4 }, { key:'M', label:'11-25 boxes',        hint:'~20 boxes', mult:1.0 }, { key:'L', label:'26-50 boxes',        hint:'~40 boxes', mult:1.8 }, { key:'XL', label:'50+ boxes',        hint:'~70 boxes', mult:3.0 }],
  holiday_decor:    [{ key:'S', label:'2-3 bins',          hint:'~3 boxes',  mult:0.4 }, { key:'M', label:'4-8 bins',           hint:'~7 boxes',  mult:1.0 }, { key:'L', label:'9-15 bins',          hint:'~12 boxes', mult:1.8 }, { key:'XL', label:'Whole room',       hint:'~20 boxes', mult:3.0 }],
  baby_items:       [{ key:'S', label:'Small items',       hint:'~3 boxes',  mult:0.4 }, { key:'M', label:'Standard nursery',   hint:'~8 boxes',  mult:1.0 }, { key:'L', label:'Full nursery',       hint:'~14 boxes', mult:1.8 }, { key:'XL', label:'Twins/multiples',  hint:'~22 boxes', mult:3.0 }],
  outdoor_furniture:[{ key:'S', label:'1-2 pieces',        hint:'~2 pads',   mult:0.4 }, { key:'M', label:'Patio set',          hint:'~5 pads',   mult:1.0 }, { key:'L', label:'Full patio',         hint:'~9 pads',   mult:1.8 }, { key:'XL', label:'Large outdoor',    hint:'~15 pads',  mult:3.0 }],
  plants:           [{ key:'S', label:'1-5 pots',          hint:'~2 boxes',  mult:0.4 }, { key:'M', label:'6-15 pots',          hint:'~5 boxes',  mult:1.0 }, { key:'L', label:'16-30 pots',         hint:'~10 boxes', mult:1.8 }, { key:'XL', label:'30+ pots',         hint:'~18 boxes', mult:3.0 }],
  chemicals:        [{ key:'S', label:'Few products',      hint:'~1 box',    mult:0.4 }, { key:'M', label:'Standard supply',    hint:'~2 boxes',  mult:1.0 }, { key:'L', label:'Large supply',       hint:'~4 boxes',  mult:1.8 }, { key:'XL', label:'Storage room',     hint:'~8 boxes',  mult:3.0 }],
};

// Helper to get all room presets as flat array
const getAllRoomPresets = () => Object.values(ROOM_PRESETS).flat();
const findRoomPreset = (id) => getAllRoomPresets().find(p => p.id === id);

const UNIT_OPTIONS = ['HR', 'EA', 'RL', 'DY', 'MO', 'KT', 'FLAT', 'RM', 'PK'];

// ============================================
// UTILITY FUNCTIONS
// ============================================
const generateId = () => Math.random().toString(36).substr(2, 9);

function generateLineItems(estimate) {
  const { rooms = 0, hours = 0, crew = 4, materials = {}, selectedRooms = [], aiRooms = [], storageSf = 0, storageMonths = 1, stagingType = 'off_site', materials_detail = {} } = estimate;
  const isOnSite = stagingType === 'on_site';
  // Pack-out is more labor-intensive (inventory, wrapping, packing, documenting)
  // Pack-back is simpler (unload, place, unpack - no wrapping/inventory)
  const packOutHours = hours * 0.62;
  const packBackHours = hours * 0.38;

  // Detect item categories from hint-based rooms OR AI-detected items
  let hasFragile = false, hasSpecialty = false, hasFurniture = false, hasAppliance = false;

  if (selectedRooms.length > 0) {
    // Quick Estimator path: detect from room hints
    hasFragile = selectedRooms.some(r => r.hints?.some(h => ['fragile', 'artwork', 'kitchenware', 'electronics', 'collectibles', 'instruments'].includes(h)));
    hasSpecialty = selectedRooms.some(r => r.hints?.some(h => ['artwork', 'collectibles', 'instruments'].includes(h)));
    hasFurniture = selectedRooms.some(r => r.hints?.includes('furniture'));
    hasAppliance = selectedRooms.some(r => r.hints?.some(h => ['appliances_large', 'appliances_small'].includes(h)));
  } else if (aiRooms.length > 0) {
    // Photo AI path: detect from item categories
    const allItems = aiRooms.flatMap(r => r.items || []);
    const categories = new Set(allItems.map(i => i.category));
    hasFragile = categories.has('Fragile') || categories.has('Artwork') || categories.has('Kitchenware') || categories.has('Electronics') || categories.has('Collectibles');
    hasSpecialty = categories.has('Artwork') || categories.has('Collectibles');
    hasFurniture = categories.has('Furniture');
    hasAppliance = categories.has('Appliances');
  }

  // Compute material estimates locally — fallback when backend returns sparse/incomplete materials dict
  const CATEGORY_MATS = {
    'Furniture':   { blanket: 2, shrink_wrap: 1 },
    'Appliances':  { blanket: 1, shrink_wrap: 1 },
    'Electronics': { box_medium: 0.5 },
    'Kitchenware': { box_dish: 0.125 },
    'Fragile':     { box_dish: 0.167 },
    'Books':       { box_small: 0.05 },
    'Artwork':     { box_dish: 1 },
    'Clothing':    { box_medium: 0.1 },
    'Tools':       { box_small: 0.067 },
    'Sports':      { box_large: 0.2 },
  };
  const computedMaterials = {};
  if (aiRooms.length > 0) {
    // Photo AI path: compute from detected item categories
    const allItems = aiRooms.flatMap(r => r.items || []);
    for (const item of allItems) {
      const qty = item.quantity || 1;
      const mats = CATEGORY_MATS[item.category] || {};
      for (const [matKey, perItem] of Object.entries(mats)) {
        computedMaterials[matKey] = (computedMaterials[matKey] || 0) + qty * perItem;
      }
    }
    for (const key of Object.keys(computedMaterials)) {
      computedMaterials[key] = Math.max(1, Math.ceil(computedMaterials[key]));
    }
  } else if (selectedRooms.length > 0) {
    // Quick Estimate path: compute from room hints using existing data tables
    for (const room of selectedRooms) {
      const volScale = MAT_SCALE_PER_SIZE[room.size || 'large'] || 80;
      const densityMult = DENSITY_MULT[room.density || 'normal'] || 1.0;
      const roomHintQty = room.hintQty || {};
      const roomHintVolume = room.hintVolume || {};
      for (const hint of (room.hints || [])) {
        // Unit-based hints (furniture pieces, appliances, etc.)
        if (HINT_UNIT_MATERIALS[hint]) {
          const qty = roomHintQty[hint] || 1;
          for (const [matKey, perUnit] of Object.entries(HINT_UNIT_MATERIALS[hint])) {
            computedMaterials[matKey] = (computedMaterials[matKey] || 0) + qty * perUnit;
          }
        }
        // Volume-scaled hints (kitchenware, books, clothing, etc.)
        const hintDef = CONTENT_HINTS[hint];
        if (hintDef && Object.keys(hintDef.materials).length > 0) {
          const volIdx = roomHintVolume[hint] ?? 1; // default M
          const volMult = HINT_VOLUME_LEVELS[hint]?.[volIdx]?.mult ?? 1.0;
          for (const [matKey, factor] of Object.entries(hintDef.materials)) {
            computedMaterials[matKey] = (computedMaterials[matKey] || 0) + volScale * densityMult * volMult * factor;
          }
        }
      }
    }
    for (const key of Object.keys(computedMaterials)) {
      computedMaterials[key] = Math.max(1, Math.ceil(computedMaterials[key]));
    }
  }
  // Effective materials: prefer backend-provided values (> 0), fall back to computed
  const effectiveMaterials = { ...computedMaterials };
  for (const [key, val] of Object.entries(materials)) {
    if (val > 0) effectiveMaterials[key] = val;
  }

  // Build dynamic description context from AI-detected or hint-based rooms
  const ctx = (() => {
    const notable = [], highValue = [], categories = new Set(), roomNames = [];
    // Map category -> item names for targeted descriptions
    const itemsByCategory = {};
    // Track items that need disassembly
    const disassemblyItems = [];
    if (aiRooms.length > 0) {
      aiRooms.forEach(r => {
        roomNames.push(r.room_name || r.roomName || r.name || 'Room');
        (r.items || []).forEach(item => {
          categories.add(item.category);
          if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
          itemsByCategory[item.category].push(item.name);
          if (item.is_high_value || item.isHighValue) { highValue.push(item.name); notable.push(item.name); }
          else if (['Furniture', 'Appliances', 'Electronics', 'Artwork'].includes(item.category)) notable.push(item.name);
          if (item.needs_disassembly || item.needsDisassembly) disassemblyItems.push(item.name);
        });
      });
    } else if (selectedRooms.length > 0) {
      selectedRooms.forEach(r => {
        roomNames.push(r.label || r.preset || 'Room');
        (r.hints || []).forEach(h => categories.add(h));
      });
    }
    // Collect unique floors from rooms
    const floors = new Set();
    if (aiRooms.length > 0) aiRooms.forEach(r => { if (r.floor) floors.add(r.floor); });
    else if (selectedRooms.length > 0) selectedRooms.forEach(r => { if (r.floor) floors.add(r.floor); });
    return { notable, highValue, categories: [...categories], roomNames, floors: [...floors], itemsByCategory, disassemblyItems, hasContext: notable.length > 0 || roomNames.length > 0 };
  })();

  const listStr = (items, max = 3) => {
    const arr = items.slice(0, max).filter(Boolean);
    if (arr.length <= 1) return arr[0] || '';
    return arr.slice(0, -1).join(', ') + ', and ' + arr[arr.length - 1];
  };

  const matDetail = (key, fallback) => {
    // Prefer backend-generated basis description (has category + room context)
    if (materials_detail[key]) return materials_detail[key];
    return fallback;
  };

  return [
    {
      id: 'packout_labor',
      title: 'PACK-OUT LABOR — INITIAL PACKING & LOADING',
      items: [
        {
          id: generateId(),
          name: 'Pack-Out Crew Labor — Standard Contents Handling',
          detail: ctx.hasContext && ctx.notable.length > 0
            ? `${crew}-person crew, packing ${listStr(ctx.roomNames, 3)} including ${listStr(ctx.notable, 4)}`
            : `${crew}-person crew; packing, wrapping, loading`,
          qty: Math.max(crew, Math.round(packOutHours * 0.6 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        hasFragile && {
          id: generateId(),
          name: 'Pack-Out Crew Labor — Fragile & Delicate Items',
          detail: ctx.highValue.length > 0
            ? `Extra care packaging: ${listStr(ctx.highValue, 3)}`
            : 'Glassware, artwork, electronics, collectibles',
          qty: Math.max(crew, Math.round(packOutHours * 0.15 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor_fragile,
        },
        (hasSpecialty && ctx.highValue.length >= 4) && {
          id: generateId(),
          name: 'Pack-Out Crew Labor — Specialty / High-Value',
          detail: `Custom handling for ${ctx.highValue.length} high-value items: ${listStr(ctx.highValue, 4)}`,
          qty: Math.max(crew, Math.round(packOutHours * 0.08 * (ctx.highValue.length / 4) * crew)), unit: 'HR', price: DEFAULT_PRICES.labor_specialty,
        },
        hasFurniture && {
          id: generateId(),
          name: 'Furniture Disassembly Labor',
          detail: ctx.disassemblyItems.length > 0
            ? `Disassembly: ${listStr(ctx.disassemblyItems, 3)}`
            : (ctx.itemsByCategory['Furniture'] || []).length > 0
              ? `Disassembly: ${listStr(ctx.itemsByCategory['Furniture'], 3)}`
              : 'Furniture disassembly as needed',
          qty: Math.max(crew, Math.round(packOutHours * 0.1 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        hasAppliance && {
          id: generateId(),
          name: 'Appliance Preparation & Handling',
          detail: 'Secure, pad-wrap appliances',
          qty: Math.max(crew, Math.round(packOutHours * 0.08 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        (rooms >= 6 && ctx.floors.length >= 2) && {
          id: generateId(),
          name: 'Contents Inventory & Documentation',
          detail: `Photo-inventory and condition reporting across ${ctx.floors.length} floors, ${rooms} rooms — ${listStr(ctx.roomNames, 4)}`,
          qty: Math.max(1, Math.round(hours * 0.06)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        {
          id: generateId(),
          name: 'Crew Supervisor / Project Manager',
          detail: ctx.roomNames.length > 0
            ? `On-site supervision across ${ctx.roomNames.length} rooms, inventory documentation, quality control`
            : 'Quality control, client communication',
          qty: Math.max(1, Math.round(hours * 0.12)), unit: 'HR', price: DEFAULT_PRICES.supervisor,
        },
      ].filter(Boolean)
    },
    {
      id: 'materials',
      title: 'PACKING MATERIALS & SUPPLIES',
      items: [
        effectiveMaterials.box_small > 0 && { id: generateId(), name: 'Small Cartons (1.5 Cu Ft)', detail: matDetail('box_small', 'Books, small decor, electronics'), qty: effectiveMaterials.box_small, unit: 'EA', price: DEFAULT_PRICES.box_small },
        effectiveMaterials.box_medium > 0 && { id: generateId(), name: 'Medium Cartons (3.0 Cu Ft)', detail: matDetail('box_medium', 'General household, consumables'), qty: effectiveMaterials.box_medium, unit: 'EA', price: DEFAULT_PRICES.box_medium },
        effectiveMaterials.box_large > 0 && { id: generateId(), name: 'Large Cartons (4.5 Cu Ft)', detail: matDetail('box_large', 'Soft goods, light bulky items'), qty: effectiveMaterials.box_large, unit: 'EA', price: DEFAULT_PRICES.box_large },
        effectiveMaterials.box_dish > 0 && { id: generateId(), name: 'Dish-Pack / Reinforced Cartons', detail: matDetail('box_dish', 'Frames, fragile decor, glass'), qty: effectiveMaterials.box_dish, unit: 'EA', price: DEFAULT_PRICES.box_dish },
        effectiveMaterials.box_wardrobe > 0 && { id: generateId(), name: 'Wardrobe Boxes', detail: matDetail('box_wardrobe', 'Hanging garments'), qty: effectiveMaterials.box_wardrobe, unit: 'EA', price: DEFAULT_PRICES.box_wardrobe },
        effectiveMaterials.blanket > 0 && { id: generateId(), name: 'Heavy-Duty Moving Pads (72" × 80")', detail: matDetail('blanket', 'Furniture wrapping'), qty: effectiveMaterials.blanket, unit: 'EA', price: DEFAULT_PRICES.blanket },
        effectiveMaterials.furniture_pad > 0 && { id: generateId(), name: 'Heavyweight Furniture Pad', detail: matDetail('furniture_pad', 'Heavy furniture protection'), qty: effectiveMaterials.furniture_pad, unit: 'EA', price: DEFAULT_PRICES.furniture_pad },
        effectiveMaterials.chair_cover > 0 && { id: generateId(), name: 'Plastic Chair Cover & Tape', detail: matDetail('chair_cover', 'Chair protection'), qty: effectiveMaterials.chair_cover, unit: 'EA', price: DEFAULT_PRICES.chair_cover },
        effectiveMaterials.sofa_cover > 0 && { id: generateId(), name: 'Plastic Couch/Sofa Cover & Tape', detail: matDetail('sofa_cover', 'Sofa/couch protection'), qty: effectiveMaterials.sofa_cover, unit: 'EA', price: DEFAULT_PRICES.sofa_cover },
        effectiveMaterials.shrink_wrap > 0 && { id: generateId(), name: '4-Mil Stretch Wrap Rolls', detail: matDetail('shrink_wrap', 'Furniture securing'), qty: effectiveMaterials.shrink_wrap, unit: 'RL', price: DEFAULT_PRICES.shrink_wrap },
        { id: generateId(), name: 'Packing Paper — Bundle (50 lb)', detail: matDetail('packing_paper', 'Wrapping dishes, glassware, and fragile items'), qty: Math.max(1, effectiveMaterials.packing_paper || Math.ceil(rooms / 3)), unit: 'BN', price: DEFAULT_PRICES.packing_paper },
        { id: generateId(), name: 'Labeling Supplies — labels, markers, tags', detail: 'Room labels, markers, inventory tags', qty: Math.max(2, Math.ceil(rooms / 4)), unit: 'KT', price: 60.11 },
      ].filter(Boolean)
    },
    {
      id: 'transport_out',
      title: isOnSite ? 'ON-SITE CONTENT RELOCATION' : 'TRANSPORTATION & LOGISTICS',
      items: isOnSite
        ? [{ id: generateId(), name: 'On-Site Content Relocation — Pack-Out', detail: `${crew}-person crew moving contents to staging area within property`, qty: crew, unit: 'HR', price: DEFAULT_PRICES.labor }]
        : [{ id: generateId(), name: 'Moving Van (21\'–27\') — Pack-Out Trip', detail: 'Residence to storage facility', qty: 1, unit: 'DY', price: DEFAULT_PRICES.truck_26 }]
    },
    !isOnSite && {
      id: 'storage',
      title: 'CLIMATE-CONTROLLED STORAGE',
      items: [
        { id: generateId(), name: 'Climate-Controlled Off-Site Storage & Insurance', detail: `${snapToStorageUnit(storageSf || 25)} SF unit; temp 55–80°F; humidity controlled; $${DEFAULT_PRICES.storage_sf.toFixed(2)}/SF/mo`, qty: snapToStorageUnit(storageSf || 25) * storageMonths, unit: 'SF', price: DEFAULT_PRICES.storage_sf },
        { id: generateId(), name: 'Initial Storage Setup — Unit Preparation', detail: `${snapToStorageUnit(storageSf || 25)} SF unit — shelving, inventory placement, padlock`, qty: 1, unit: 'EA', price: getStorageSetupFee(snapToStorageUnit(storageSf || 25)) },
      ]
    },
    {
      id: 'packback',
      title: isOnSite ? 'ON-SITE PACK-BACK (RETURN)' : 'RETRIEVAL, DELIVERY & PACK-BACK (RETURN)',
      items: [
        isOnSite
          ? { id: generateId(), name: 'On-Site Content Relocation — Pack-Back', detail: `${crew}-person crew moving contents from staging area back to restored rooms`, qty: crew, unit: 'HR', price: DEFAULT_PRICES.labor }
          : { id: generateId(), name: 'Moving Van — Return Trip', detail: 'Storage to restored residence', qty: 1, unit: 'DY', price: DEFAULT_PRICES.truck_26 },
        {
          id: generateId(),
          name: 'Pack-Back Crew Labor — Unloading & Placement',
          detail: ctx.hasContext && ctx.roomNames.length > 0
            ? `${crew}-person crew, unloading and placement in ${listStr(ctx.roomNames, 3)}, unpacking`
            : `${crew}-person crew; unload, unpack, place`,
          qty: Math.max(crew, Math.round(packBackHours * 0.55 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        hasFurniture && {
          id: generateId(),
          name: 'Furniture Reassembly Labor',
          detail: ctx.disassemblyItems.length > 0
            ? `Reassembly: ${listStr(ctx.disassemblyItems, 3)}`
            : (ctx.itemsByCategory['Furniture'] || []).length > 0
              ? `Reassembly: ${listStr(ctx.itemsByCategory['Furniture'], 3)}`
              : 'Furniture reassembly as needed',
          qty: Math.max(crew, Math.round(packBackHours * 0.15 * crew)), unit: 'HR', price: DEFAULT_PRICES.labor,
        },
        { id: generateId(), name: 'Unpacking Waste Removal & Disposal', detail: 'Removal of packing materials', qty: Math.max(crew, Math.round(packBackHours * 0.06 * crew)), unit: 'HR', price: 57.31 },
        { id: generateId(), name: 'Crew Supervisor — Pack-Back Oversight', detail: 'Quality control', qty: Math.max(1, Math.round(packBackHours * 0.10)), unit: 'HR', price: DEFAULT_PRICES.supervisor },
      ].filter(Boolean)
    }
  ].filter(Boolean);
}

// ============================================
// BUILD LINE ITEMS FROM BACKEND SECTIONS
// Converts backend { "Pack-Out Labor": 1234.56, ... } to frontend section format.
// Uses backend totals (authoritative) + detailed materials from generateLineItems.
// ============================================
function sectionsFromBackend(estimate) {
  const backendSections = estimate.sections || {};
  const sectionDetails = estimate.section_details || {};
  // Get the detailed materials section from generateLineItems (has per-item breakdown)
  const generated = generateLineItems(estimate);
  const materialsSection = generated.find(s => s.id === 'materials');

  // Mapping: backend section name → frontend section id & title
  const SECTION_CONFIG = {
    'Pack-Out Labor':        { id: 'packout_labor', title: 'PACK-OUT LABOR — INITIAL PACKING & LOADING' },
    'Supervision':           { id: 'packout_labor', title: 'PACK-OUT LABOR — INITIAL PACKING & LOADING' },
    'On-Site Relocation':    { id: 'transport_out', title: 'ON-SITE CONTENT RELOCATION' },
    'Transport Out':         { id: 'transport_out', title: 'TRANSPORTATION & LOGISTICS' },
    'Storage':               { id: 'storage',       title: 'CLIMATE-CONTROLLED STORAGE' },
    'Debris Hauling':        { id: 'debris',        title: 'DEBRIS HAULING' },
    'On-Site Pack-Back Move':{ id: 'packback',      title: 'ON-SITE PACK-BACK (RETURN)' },
    'Transport Back':        { id: 'packback',      title: 'RETRIEVAL, DELIVERY & PACK-BACK (RETURN)' },
    'Pack-Back Labor':       { id: 'packback',      title: 'RETRIEVAL, DELIVERY & PACK-BACK (RETURN)' },
    'Furniture Assembly':    { id: 'packback',      title: 'RETRIEVAL, DELIVERY & PACK-BACK (RETURN)' },
  };

  const sectionMap = {};
  for (const [name, total] of Object.entries(backendSections)) {
    if (name === 'Materials') continue; // handled separately with detail
    const cfg = SECTION_CONFIG[name];
    if (!cfg) continue;
    if (!sectionMap[cfg.id]) {
      sectionMap[cfg.id] = { id: cfg.id, title: cfg.title, items: [] };
    }
    // Use detailed line breakdown when available, otherwise fall back to LS
    const detail = sectionDetails[name];
    if (detail?.lines?.length > 0) {
      for (const line of detail.lines) {
        sectionMap[cfg.id].items.push({
          id: generateId(), name: line.name, detail: line.detail || '',
          qty: line.qty, unit: line.unit, price: line.rate,
        });
      }
    } else {
      sectionMap[cfg.id].items.push({
        id: generateId(), name, detail: '', qty: 1, unit: 'LS', price: total,
      });
    }
  }

  const ORDER = ['packout_labor', 'transport_out', 'storage', 'debris', 'packback'];
  const result = ORDER.map(id => sectionMap[id]).filter(Boolean);

  // Insert materials section (detailed items) after pack-out labor
  const insertAt = result.findIndex(s => s.id === 'transport_out');
  if (materialsSection) {
    result.splice(insertAt >= 0 ? insertAt : result.length, 0, materialsSection);
  }

  return result;
}

// ============================================
// MEMOIZED LINE ITEM ROW - Performance Optimized
// ============================================
const LineItemRow = memo(function LineItemRow({ item, sectionId, itemIndex, onUpdate, onDelete, isEditing, onStartEdit, onEndEdit, onPendingChange }) {
  const [localItem, setLocalItem] = useState(item);

  useEffect(() => { setLocalItem(item); }, [item]);

  const handleChange = useCallback((field, value) => {
    setLocalItem(prev => {
      const updated = { ...prev, [field]: value };
      onPendingChange?.(sectionId, item.id, updated);
      return updated;
    });
  }, [sectionId, item.id, onPendingChange]);
  
  const handleSave = useCallback(() => {
    onUpdate(sectionId, item.id, localItem);
    onEndEdit();
  }, [sectionId, item.id, localItem, onUpdate, onEndEdit]);
  
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onEndEdit();
  }, [handleSave, onEndEdit]);
  
  const total = (localItem.qty || 0) * (localItem.price || 0);
  
  if (isEditing) {
    return (
      <tr className="bg-blue-50 border-l-4 border-blue-500">
        <td className="px-2 py-2 text-center text-xs text-gray-400">{itemIndex + 1}</td>
        <td className="px-2 py-2">
          <input type="text" value={localItem.name} onChange={e => handleChange('name', e.target.value)}
            onKeyDown={handleKeyDown} className="w-full border rounded px-2 py-1 text-sm font-medium" autoFocus />
          <input type="text" value={localItem.detail || ''} onChange={e => handleChange('detail', e.target.value)}
            onKeyDown={handleKeyDown} placeholder="Detail (optional)" className="w-full border rounded px-2 py-1 text-xs mt-1 text-gray-500" />
        </td>
        <td className="px-2 py-2">
          <input type="number" value={localItem.qty} onChange={e => handleChange('qty', parseFloat(e.target.value) || 0)}
            onKeyDown={handleKeyDown} className="w-16 border rounded px-2 py-1 text-sm text-right" min="0" step="0.5" />
        </td>
        <td className="px-2 py-2">
          <select value={localItem.unit} onChange={e => handleChange('unit', e.target.value)} className="border rounded px-1 py-1 text-sm">
            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-2 py-2">
          <input type="number" value={localItem.price} onChange={e => handleChange('price', parseFloat(e.target.value) || 0)}
            onKeyDown={handleKeyDown} className="w-20 border rounded px-2 py-1 text-sm text-right" min="0" step="0.01" />
        </td>
        <td className="px-2 py-2 text-right font-medium text-sm">${total.toFixed(2)}</td>
        <td className="px-2 py-2 text-center">
          <div className="flex gap-1 justify-center">
            <button onClick={handleSave} className="text-green-500 hover:text-green-700 p-1"><Check size={14} /></button>
            <button onClick={onEndEdit} className="text-gray-400 hover:text-gray-600 p-1"><X size={14} /></button>
          </div>
        </td>
      </tr>
    );
  }
  
  return (
    <tr className="hover:bg-gray-50 group cursor-pointer" onDoubleClick={onStartEdit}>
      <td className="px-2 py-2 text-center text-xs text-gray-300">{itemIndex + 1}</td>
      <td className="px-2 py-2">
        <div className="text-sm font-medium">{item.name}</div>
        {item.detail && <div className="text-xs text-gray-400">{item.detail}</div>}
      </td>
      <td className="px-2 py-2 text-right text-sm">{item.qty}</td>
      <td className="px-2 py-2 text-center text-sm text-gray-500">{item.unit}</td>
      <td className="px-2 py-2 text-right text-sm">${item.price.toFixed(2)}</td>
      <td className="px-2 py-2 text-right text-sm font-medium">${total.toFixed(2)}</td>
      <td className="px-2 py-2">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onStartEdit} className="text-gray-400 hover:text-blue-500 p-1"><Edit3 size={14} /></button>
        </div>
      </td>
    </tr>
  );
});

// ============================================
// MEMOIZED SECTION COMPONENT
// ============================================
const EstimateSection = memo(function EstimateSection({ section, onUpdateItem, onDeleteItem, onAddItem, onDeleteSection, editingItem, setEditingItem, onPendingChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(section.title);
  
  const sectionTotal = useMemo(() => section.items.reduce((sum, item) => sum + (item.qty * item.price), 0), [section.items]);
  
  const handleAddItem = useCallback(() => {
    const newItem = { id: generateId(), name: 'New Line Item', detail: '', qty: 1, unit: 'EA', price: 0 };
    onAddItem(section.id, newItem);
    setEditingItem(`${section.id}-${newItem.id}`);
  }, [section.id, onAddItem, setEditingItem]);
  
  return (
    <div className="border rounded-lg overflow-hidden mb-4 shadow-sm">
      <div className="bg-gray-100 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3 flex-1">
          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-gray-600">
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
          {editingTitle ? (
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)} onKeyDown={e => e.key === 'Enter' && setEditingTitle(false)}
              className="flex-1 border rounded px-2 py-1 text-sm font-semibold" autoFocus />
          ) : (
            <span className="font-semibold text-sm cursor-pointer hover:text-blue-600" onDoubleClick={() => setEditingTitle(true)}>
              {section.title}
            </span>
          )}
          <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded">{section.items.length} items</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold text-lg">${sectionTotal.toFixed(2)}</span>
          <button onClick={() => onDeleteSection(section.id)} className="text-gray-300 hover:text-red-500" title="Delete Section">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      
      {!collapsed && (
        <>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-t">
              <tr>
                <th className="w-10 px-2 py-2 text-center text-xs font-medium text-gray-400">#</th>
                <th className="text-left px-2 py-2 font-medium text-gray-600">Item Description</th>
                <th className="w-20 text-right px-2 py-2 font-medium text-gray-600">Qty</th>
                <th className="w-16 text-center px-2 py-2 font-medium text-gray-600">Unit</th>
                <th className="w-24 text-right px-2 py-2 font-medium text-gray-600">Price</th>
                <th className="w-24 text-right px-2 py-2 font-medium text-gray-600">Total</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {section.items.map((item, idx) => (
                <LineItemRow key={item.id} item={item} sectionId={section.id} itemIndex={idx}
                  onUpdate={onUpdateItem} onDelete={onDeleteItem}
                  isEditing={editingItem === `${section.id}-${item.id}`}
                  onStartEdit={() => setEditingItem(`${section.id}-${item.id}`)}
                  onEndEdit={() => setEditingItem(null)}
                  onPendingChange={onPendingChange} />
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 border-t flex justify-between items-center">
            <button onClick={handleAddItem} className="text-sm text-blue-500 hover:text-blue-700 flex items-center gap-1">
              <Plus size={14} /> Add Line Item
            </button>
            <div className="text-sm font-semibold">Subtotal: ${sectionTotal.toFixed(2)}</div>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================
// AREA BREAKDOWN GENERATOR
// ============================================
const FLOOR_ORDER = ['basement', '1st', '2nd', '3rd', '4th+'];
const FLOOR_LABEL = { basement: 'Basement', '1st': '1st Floor', '2nd': '2nd Floor', '3rd': '3rd Floor', '4th+': '4th+ Floor' };

function generateAreaBreakdown(aiRooms) {
  if (!aiRooms || aiRooms.length === 0) return '';
  const SIZE_LABEL = { small: 'Small', large: 'Large', xlarge: 'X-Large' };
  const DENSITY_LABEL = { light: 'Light', normal: 'Normal', dense: 'Dense', heavy: 'Heavy', extreme: 'Extreme' };

  // Group by floor
  const byFloor = {};
  aiRooms.forEach(room => {
    if ((room.items || []).length === 0) return;
    const fl = room.floor || '1st';
    const roomName = room.room_name || room.roomName || room.name || 'Room';
    const size = room.room_size || room.roomSize || 'large';
    const density = room.density || 'normal';
    const label = `${roomName} (${SIZE_LABEL[size] || size} / ${DENSITY_LABEL[density] || density})`;
    (byFloor[fl] = byFloor[fl] || []).push(label);
  });

  const floors = FLOOR_ORDER.filter(f => byFloor[f]);
  if (floors.length === 0) return '';

  // Single floor → no header, just room list
  if (floors.length === 1) return byFloor[floors[0]].join('\n');

  // Multiple floors → group with floor headers
  return floors.map(f => `${FLOOR_LABEL[f]}:\n${byFloor[f].map(r => `  ${r}`).join('\n')}`).join('\n');
}

// ============================================
// AREA BREAKDOWN DISPLAY (modal, floor-grouped)
// ============================================
function AreaBreakdownDisplay({ aiRooms }) {
  const SIZE_LABEL = { small: 'Small', large: 'Large', xlarge: 'X-Large' };
  const DENSITY_LABEL = { light: 'Light', normal: 'Normal', dense: 'Dense', heavy: 'Heavy', extreme: 'Extreme' };

  const byFloor = {};
  (aiRooms || []).forEach(room => {
    if ((room.items || []).length === 0) return;
    const fl = room.floor || '1st';
    const roomName = room.room_name || room.roomName || room.name || 'Room';
    const size = room.room_size || room.roomSize || 'large';
    const density = room.density || 'normal';
    (byFloor[fl] = byFloor[fl] || []).push(
      `${roomName} (${SIZE_LABEL[size] || size} / ${DENSITY_LABEL[density] || density})`
    );
  });

  const floors = FLOOR_ORDER.filter(f => byFloor[f]);
  if (floors.length === 0) return null;

  const multiFloor = floors.length > 1;

  return (
    <div className="px-6 py-4 border-t bg-indigo-50/50">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Area Breakdown</div>
        <span className="text-xs text-indigo-400">Auto-generated from photo analysis</span>
      </div>
      <div className="space-y-2">
        {floors.map(fl => (
          <div key={fl}>
            {multiFloor && (
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{FLOOR_LABEL[fl]}</div>
            )}
            <ul className={multiFloor ? 'ml-3 space-y-0.5' : 'space-y-0.5'}>
              {byFloor[fl].map((label, i) => (
                <li key={i} className="text-sm text-gray-700">{label}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// ESTIMATE EDITOR MODAL
// ============================================
function EstimateEditorModal({ initialData, apiConnected, companyInfo, onClose, onSaved, onError, onAddRooms }) {
  const [sections, setSections] = useState(() => {
    if (initialData.lineItems?.length > 0) return initialData.lineItems;
    // Use backend sections (authoritative totals) when available
    if (initialData.sections && Object.keys(initialData.sections).length > 0) {
      return sectionsFromBackend(initialData);
    }
    return generateLineItems(initialData);
  });
  const [editingItem, setEditingItem] = useState(null);
  const pendingEditRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [taxRate, setTaxRate] = useState(0);
  const [includeOP, setIncludeOP] = useState(initialData.includeOP !== false);
  const [opRate, setOpRate] = useState(initialData.opRate || 20);
  const [includeContingency, setIncludeContingency] = useState(false);
  const [contingencyRate, setContingencyRate] = useState(0);
  const [supplements, setSupplements] = useState(initialData.supplements || []);
  const [includeInsuranceClauses, setIncludeInsuranceClauses] = useState(false);
  const autoBreakdown = useMemo(() => initialData.fromPhotoAI ? generateAreaBreakdown(initialData.aiRooms) : '', [initialData]);

  // Parse combined "123 Main St, Portland, OR 97201" → { street, cityState }
  const parsedAddr = (() => {
    const addr = initialData.propertyAddress || '';
    const idx = addr.indexOf(',');
    if (!addr) return { street: '', cityState: '' };
    if (idx === -1) return { street: addr.trim(), cityState: '' };
    return { street: addr.slice(0, idx).trim(), cityState: addr.slice(idx + 1).trim() };
  })();

  const [saveForm, setSaveForm] = useState({ show: false, clientName: initialData.clientName || '', clientPhone: initialData.clientPhone || '', clientEmail: initialData.clientEmail || '', propertyStreet: parsedAddr.street, propertyCityState: parsedAddr.cityState, notes: initialData.notes || '', areaBreakdown: autoBreakdown });

  const supplementsTotal = useMemo(() => supplements.filter(s => s.enabled).reduce((sum, s) => sum + (s.amount || 0), 0), [supplements]);

  const totals = useMemo(() => {
    const subtotal = sections.reduce((sum, sec) => sum + sec.items.reduce((s, item) => s + (item.qty * item.price), 0), 0);
    const op = includeOP ? subtotal * (opRate / 100) : 0;
    const contingency = includeContingency ? subtotal * (contingencyRate / 100) : 0;
    const tax = (subtotal + op + contingency + supplementsTotal) * (taxRate / 100);
    return { subtotal, op, contingency, supplementsTotal, tax, grandTotal: subtotal + op + contingency + supplementsTotal + tax };
  }, [sections, taxRate, includeOP, opRate, includeContingency, contingencyRate, supplementsTotal]);
  
  const handleUpdateItem = useCallback((sectionId, itemId, updatedItem) => {
    pendingEditRef.current = null;
    setSections(prev => prev.map(sec => sec.id !== sectionId ? sec : { ...sec, items: sec.items.map(item => item.id === itemId ? updatedItem : item) }));
  }, []);

  const handlePendingChange = useCallback((sectionId, itemId, updatedItem) => {
    pendingEditRef.current = { sectionId, itemId, item: updatedItem };
  }, []);
  
  const handleDeleteItem = useCallback((sectionId, itemId) => {
    setSections(prev => prev.map(sec => sec.id !== sectionId ? sec : { ...sec, items: sec.items.filter(item => item.id !== itemId) }));
  }, []);
  
  const handleAddItem = useCallback((sectionId, newItem) => {
    setSections(prev => prev.map(sec => sec.id !== sectionId ? sec : { ...sec, items: [...sec.items, newItem] }));
  }, []);
  
  const handleAddSection = useCallback(() => {
    setSections(prev => [...prev, { id: generateId(), title: 'NEW SECTION', items: [] }]);
  }, []);
  
  const handleDeleteSection = useCallback((sectionId) => {
    if (confirm('Delete this entire section?')) {
      setSections(prev => prev.filter(s => s.id !== sectionId));
    }
  }, []);
  
  // Build room_summaries for backend DescriptionBuilder
  const roomSummaries = useMemo(() => {
    const aiRooms = initialData.aiRooms || [];
    const selRooms = initialData.selectedRooms || [];
    if (aiRooms.length > 0) {
      return aiRooms.map(r => {
        const items = r.items || [];
        const notable = [], highValue = [], categories = new Set(), packingNotes = [];
        items.forEach(item => {
          categories.add(item.category);
          if (item.is_high_value || item.isHighValue) { highValue.push(item.name); notable.push(item.name); }
          else if (['Furniture', 'Appliances', 'Electronics', 'Artwork'].includes(item.category)) notable.push(item.name);
          if (item.packing_method && (item.is_high_value || ['Furniture', 'Appliances', 'Electronics', 'Artwork'].includes(item.category)))
            packingNotes.push(`${item.name}: ${item.packing_method}`);
        });
        return { room_name: r.room_name || r.roomName || r.name, notable_items: notable.slice(0, 8), categories_present: [...categories].sort(), high_value_items: highValue.slice(0, 5), packing_notes: packingNotes.slice(0, 5), item_count: items.reduce((s, i) => s + (i.quantity || 1), 0) };
      });
    } else if (selRooms.length > 0) {
      return selRooms.map(r => ({
        room_name: r.label || r.preset || 'Room', notable_items: [], categories_present: (r.hints || []).map(h => h.replace(/_/g, ' ')), high_value_items: [], packing_notes: [], item_count: r.baseItems || 0,
      }));
    }
    return [];
  }, [initialData]);

  const buildExportData = useCallback(() => {
    const pending = pendingEditRef.current;
    const effectiveSections = pending
      ? sections.map(sec => sec.id !== pending.sectionId ? sec : {
          ...sec, items: sec.items.map(i => i.id !== pending.itemId ? i : pending.item),
        })
      : sections;
    return ({
    total_rooms: initialData.rooms, total_items: initialData.items, total_hours: initialData.hours,
    crew_size: initialData.crew, storage_months: initialData.storageMonths || 1, include_packback: true,
    storage_sf: initialData.storageSf || 25,
    materials: initialData.materials || {}, line_items: effectiveSections,
    include_op: includeOP, op_rate: opRate, op_amount: totals.op,
    include_contingency: includeContingency, contingency_rate: contingencyRate, contingency_amount: totals.contingency,
    supplements, supplements_total: supplementsTotal,
    include_insurance_clauses: includeInsuranceClauses,
    room_summaries: roomSummaries,
    ai_rooms: (initialData.aiRooms || []).map(r => ({
      ...r,
      photos: (r.photos || []).map(p => ({
        id: p.id,
        name: p.name,
        preview: p.url || p.preview,
      })),
    })),
    from_photo_ai: initialData.fromPhotoAI || false,
    staging_type: initialData.stagingType || 'off_site',
    property_address: initialData.propertyAddress || '',
  });
  }, [sections, initialData, includeOP, opRate, includeContingency, contingencyRate, totals, supplements, supplementsTotal, includeInsuranceClauses, roomSummaries]);
  
  const downloadBlob = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);
  
  const handleExportPdf = useCallback(async () => {
    setExporting('pdf');
    try {
      const blob = await api.export.pdf(buildExportData(), {
        clientName: saveForm.clientName, clientPhone: saveForm.clientPhone, clientEmail: saveForm.clientEmail,
        propertyAddress: [saveForm.propertyStreet, saveForm.propertyCityState].filter(Boolean).join(', '),
        notes: saveForm.notes, areaBreakdown: saveForm.areaBreakdown,
        companyInfo: companyInfo?.name ? companyInfo : null, taxRate,
      });
      const addrSlug = (initialData.propertyAddress || saveForm.propertyStreet || '')
        .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
      const datePart = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `estimate_${addrSlug || initialData.rooms + 'rooms'}_${datePart}.pdf`);
    } catch (err) { onError?.(err.message); }
    finally { setExporting(null); }
  }, [buildExportData, saveForm, companyInfo, taxRate, initialData.rooms, downloadBlob, onError]);
  
  const handleExportExcel = useCallback(async () => {
    setExporting('excel');
    try {
      const blob = await api.export.excel(buildExportData(), {
        clientName: saveForm.clientName, clientPhone: saveForm.clientPhone, clientEmail: saveForm.clientEmail,
        propertyAddress: [saveForm.propertyStreet, saveForm.propertyCityState].filter(Boolean).join(', '),
        notes: saveForm.notes, companyInfo: companyInfo?.name ? companyInfo : null, taxRate,
      });
      downloadBlob(blob, `estimate_${initialData.rooms}rooms.xlsx`);
    } catch (err) { onError?.(err.message); }
    finally { setExporting(null); }
  }, [buildExportData, saveForm, companyInfo, taxRate, initialData.rooms, downloadBlob, onError]);
  
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const exportData = { ...buildExportData(), subtotal: totals.subtotal, tax_rate: taxRate, tax_amount: totals.tax, grand_total: totals.grandTotal };
      const propertyAddress = [saveForm.propertyStreet, saveForm.propertyCityState].filter(Boolean).join(', ');
      const savePayload = {
        client_name: saveForm.clientName, client_phone: saveForm.clientPhone, client_email: saveForm.clientEmail,
        property_address: propertyAddress, notes: saveForm.notes, estimate_data: exportData,
      };

      // Step 1: Save (or update) estimate to get a stable ID
      let estimateId = initialData.savedEstimateId;
      let savedEst;
      if (estimateId) {
        savedEst = await api.estimates.update(estimateId, savePayload);
      } else {
        savedEst = await api.estimates.save(savePayload);
        estimateId = savedEst.id;
      }

      // Step 2: Upload any new base64 photos under the real estimate ID
      if (exportData.from_photo_ai && exportData.ai_rooms && exportData.ai_rooms.length > 0) {
        const roomsWithPhotos = (initialData.aiRooms || [])
          .filter(r => r.photos && r.photos.some(p => p.preview && p.preview.startsWith('data:')))
          .map(r => ({
            room_id: r.id,
            room_name: r.name || '',
            photos: r.photos
              .filter(p => p.preview && p.preview.startsWith('data:'))
              .map(p => ({ id: p.id, name: p.name, data: p.preview })),
          }));

        if (roomsWithPhotos.length > 0) {
          const uploadResult = await api.photos.uploadRoomPhotos(estimateId, roomsWithPhotos);
          const photoUrlMap = {};
          if (uploadResult.rooms) {
            for (const [roomId, photos] of Object.entries(uploadResult.rooms)) {
              for (const photo of photos) {
                photoUrlMap[`${roomId}_${photo.id}`] = photo.url;
              }
            }
          }
          // Step 3: Update estimate_data with permanent photo URLs
          exportData.ai_rooms = exportData.ai_rooms.map(r => ({
            ...r,
            photos: (r.photos || []).map(p => {
              const url = photoUrlMap[`${r.id}_${p.id}`];
              return url ? { id: p.id, name: p.name, url } : { id: p.id, name: p.name, url: p.url || null };
            }),
          }));
          await api.estimates.update(estimateId, { ...savePayload, estimate_data: exportData });
        }
      }

      onSaved?.(); onClose();
    } catch (err) { onError?.(err.message); }
    finally { setSaving(false); }
  }, [saveForm, buildExportData, totals, taxRate, onSaved, onClose, onError, initialData]);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h2 className="text-xl font-bold">Estimate Editor</h2>
            <p className="text-xs text-gray-400 mt-1">Double-click any row to edit • Press Enter to save</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-black p-2 rounded-full hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        
        {/* Summary Bar */}
        <div className="px-6 py-3 bg-blue-50 border-b flex justify-between items-center">
          <div className="flex gap-6 text-sm">
            {[['Rooms', initialData.rooms], ['Hours', initialData.hours], ['Crew', initialData.crew]].map(([l, v]) => (
              <div key={l}><span className="text-gray-500">{l}:</span> <span className="font-semibold">{v}</span></div>
            ))}
          </div>
          <div className="text-2xl font-bold text-blue-600">${totals.grandTotal.toFixed(2)}</div>
        </div>
        
        {/* Sections */}
        <div className="px-6 py-4 max-h-[55vh] overflow-y-auto bg-gray-50">
          {sections.map(section => (
            <EstimateSection key={section.id} section={section}
              onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem}
              onAddItem={handleAddItem} onDeleteSection={handleDeleteSection}
              editingItem={editingItem} setEditingItem={setEditingItem}
              onPendingChange={handlePendingChange} />
          ))}
          <button onClick={handleAddSection}
            className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-gray-400 hover:border-blue-400 hover:text-blue-500 flex items-center justify-center gap-2 transition-colors">
            <Plus size={18} /> Add New Section
          </button>
        </div>

        {/* Area Breakdown (auto-generated from photo AI) */}
        {(initialData.fromPhotoAI && (initialData.aiRooms || []).length > 0) && (
          <AreaBreakdownDisplay aiRooms={initialData.aiRooms} />
        )}

        {/* Totals */}
        <div className="px-6 py-4 border-t bg-white">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium">${totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm items-center">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={includeOP} onChange={e => setIncludeOP(e.target.checked)} className="rounded" /><span className="text-gray-500">O&P</span></label>
                </div>
                {includeOP && <div className="flex items-center gap-1">
                  <select value={opRate} onChange={e => setOpRate(+e.target.value)} className="border rounded px-2 py-1 text-sm">{[10,15,20,25].map(r => <option key={r} value={r}>{r}%</option>)}</select>
                </div>}
              </div>
              {includeOP && <div className="flex justify-between text-sm"><span className="text-gray-500">O&P ({opRate}%)</span><span>${totals.op.toFixed(2)}</span></div>}
              {supplements.length > 0 && <>
                <div className="text-xs text-gray-400 uppercase tracking-wide mt-1">Conditional Supplements</div>
                {supplements.map(s => (
                  <div key={s.key} className="flex justify-between text-sm items-center gap-2">
                    <label className="flex items-center gap-1 cursor-pointer flex-1 min-w-0" title={s.description}>
                      <input type="checkbox" checked={s.enabled} onChange={e => setSupplements(prev => prev.map(p => p.key === s.key ? { ...p, enabled: e.target.checked } : p))} className="rounded flex-shrink-0" />
                      <span className="text-gray-500 text-xs truncate">{s.name}</span>
                    </label>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-gray-400 text-xs">$</span>
                      <input type="number" value={s.amount || 0} min="0" step="5"
                        onChange={e => setSupplements(prev => prev.map(p => p.key === s.key ? { ...p, amount: parseFloat(e.target.value) || 0 } : p))}
                        className={`w-20 border rounded px-2 py-0.5 text-sm text-right ${s.enabled ? '' : 'text-gray-300 line-through'}`} />
                    </div>
                  </div>
                ))}
              </>}
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Tax Rate</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-16 border rounded px-2 py-1 text-sm text-right" min="0" step="0.1" />
                  <span className="text-gray-400">%</span>
                </div>
              </div>
              {taxRate > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Tax</span><span>${totals.tax.toFixed(2)}</span></div>}
              <div className="flex justify-between text-xl font-bold pt-2 border-t"><span>Total</span><span className="text-blue-600">${totals.grandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
        
        {/* Terms & Conditions Options */}
        <div className="px-6 py-3 border-t bg-amber-50/50">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Terms & Conditions</div>
            <div className="text-xs text-gray-400">6 standard terms always included in export</div>
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={includeInsuranceClauses} onChange={e => setIncludeInsuranceClauses(e.target.checked)} className="rounded" />
            <span className="text-sm">Include Insurance Coordination & Payment clauses</span>
            <span className="text-xs text-gray-400 ml-1">(for insurance claim submissions)</span>
          </label>
        </div>

        {/* Save Form */}
        {saveForm.show && (
          <div className="px-6 py-4 border-t bg-green-50">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer Information</div>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Client Name" value={saveForm.clientName}
                onChange={e => setSaveForm(f => ({ ...f, clientName: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="tel" placeholder="Phone Number" value={saveForm.clientPhone}
                onChange={e => setSaveForm(f => ({ ...f, clientPhone: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="email" placeholder="Email Address" value={saveForm.clientEmail}
                onChange={e => setSaveForm(f => ({ ...f, clientEmail: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="text" placeholder="Street Address" value={saveForm.propertyStreet}
                onChange={e => setSaveForm(f => ({ ...f, propertyStreet: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <input type="text" placeholder="City, State ZIP" value={saveForm.propertyCityState}
                onChange={e => setSaveForm(f => ({ ...f, propertyCityState: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm" />
              <textarea placeholder="Notes" value={saveForm.notes}
                onChange={e => setSaveForm(f => ({ ...f, notes: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm col-span-2" rows={2} />
              <textarea placeholder="Area Breakdown (optional — auto-generated from photo analysis)" value={saveForm.areaBreakdown}
                onChange={e => setSaveForm(f => ({ ...f, areaBreakdown: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm col-span-2" rows={4} />
            </div>
          </div>
        )}
        
        {/* Footer Actions */}
        <div className="flex justify-between px-6 py-4 border-t bg-white rounded-b-2xl">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-black">Cancel</button>
            {onAddRooms && (
              <button
                onClick={() => onAddRooms({ ...initialData, aiRooms: initialData.aiRooms || [], clientName: saveForm.clientName, clientPhone: saveForm.clientPhone, clientEmail: saveForm.clientEmail, notes: saveForm.notes, propertyAddress: [saveForm.propertyStreet, saveForm.propertyCityState].filter(Boolean).join(', ') })}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5">
                <Camera size={14} /> Add More Rooms
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportPdf} disabled={exporting === 'pdf' || !apiConnected}
              className="px-4 py-2 border rounded-lg text-sm flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50">
              {exporting === 'pdf' ? <Loader size={14} className="animate-spin" /> : <Download size={14} />} PDF
            </button>
            <button onClick={handleExportExcel} disabled={exporting === 'excel' || !apiConnected}
              className="px-4 py-2 border rounded-lg text-sm flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50">
              {exporting === 'excel' ? <Loader size={14} className="animate-spin" /> : <FileText size={14} />} Excel
            </button>
            {!saveForm.show ? (
              <button onClick={() => setSaveForm(f => ({ ...f, show: true }))}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-1.5">
                <Save size={14} /> Save Estimate
              </button>
            ) : (
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-1.5">
                {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Confirm Save
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// MODALS
// ============================================
const Modal = memo(function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black"><X size={20} /></button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
});

function CompanyModal({ companyInfo, photoSettings, onSave, onClose }) {
  const [data, setData] = useState(companyInfo);
  const [photo, setPhoto] = useState(photoSettings || { dedup_threshold: 0.95, max_images: 6 });
  const handleSave = useCallback(() => { onSave(data, photo); onClose(); }, [data, photo, onSave, onClose]);

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-5">
        {/* Company Info */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Company Information</p>
          <p className="text-sm text-gray-500 mb-3">This information will appear on exported estimates.</p>
          <div className="space-y-3">
            {[['Company Name', 'name', 'ABC Moving & Restoration'], ['Address', 'address', '123 Business Blvd'], ['Phone', 'phone', '(555) 123-4567'], ['Email', 'email', 'info@company.com']].map(([label, key, placeholder]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                <input type={key === 'email' ? 'email' : 'text'} value={data[key]} onChange={e => setData({ ...data, [key]: e.target.value })}
                  placeholder={placeholder} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Photo AI Settings */}
        <div className="border-t pt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Photo AI Settings</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Duplicate Threshold</label>
                <span className="text-xs font-mono text-gray-700">{photo.dedup_threshold.toFixed(2)}</span>
              </div>
              <input type="range" min="0.80" max="1.00" step="0.01"
                value={photo.dedup_threshold}
                onChange={e => setPhoto({ ...photo, dedup_threshold: parseFloat(e.target.value) })}
                className="w-full accent-blue-500" />
              <p className="text-xs text-gray-400 mt-1">Lower = more aggressive deduplication. 0.95 is recommended.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Max Images per Room</label>
              <select value={photo.max_images} onChange={e => setPhoto({ ...photo, max_images: parseInt(e.target.value) })}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">After deduplication. More images = higher API cost.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-5 pt-4 border-t">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
        <button onClick={handleSave} className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium"><Save size={14} className="inline mr-1" />Save</button>
      </div>
    </Modal>
  );
}

// ============================================
// PHOTO AI ANALYSIS TAB (Room-Based)
// ============================================
const ITEM_CATEGORIES = ['Furniture', 'Electronics', 'Books', 'Kitchenware', 'Clothing', 'Fragile', 'Artwork', 'Collectibles', 'Appliances', 'Tools', 'Sports', 'Other'];

const PhotoAnalysisTab = memo(function PhotoAnalysisTab({ onEstimate, onError, apiConnected, initialRooms, onMounted, defaultRegion }) {
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [rooms, setRooms] = useState(() => {
    if (initialRooms && initialRooms.length > 0) {
      return initialRooms.map(r => ({
        ...r,
        id: r.id || generateId(),
        analyzed: true,
        analyzing: false,
        photos: r.photos || [],
      }));
    }
    return [];
  });
  const [generating, setGenerating] = useState(false);
  const [estimateHours, setEstimateHours] = useState(null);
  const [region, setRegion] = useState(() => defaultRegion || 'mid_atlantic');
  const correctionsBuffer = useRef({});

  useEffect(() => {
    if (initialRooms && initialRooms.length > 0) {
      setRooms(prev => {
        const existingIds = new Set(prev.map(r => r.id));
        const newRooms = initialRooms
          .filter(r => !existingIds.has(r.id))
          .map(r => ({
            ...r,
            id: r.id || generateId(),
            analyzed: true,
            analyzing: false,
            photos: r.photos || [],
          }));
        if (newRooms.length === 0) return prev;
        return [...prev, ...newRooms];
      });
      setSettingsLocked(true);
      if (onMounted) onMounted();
    }
  }, [initialRooms]);

  // Global settings (set once, not per-room)
  const [propertyAddress, setPropertyAddress] = useState('');
  const [crewSize, setCrewSize] = useState(4);
  const [stagingType, setStagingType] = useState('off_site');
  const [storageMonths, setStorageMonths] = useState(1);
  const [includePackback, setIncludePackback] = useState(true);
  const [settingsLocked, setSettingsLocked] = useState(() => !!(initialRooms && initialRooms.length > 0));
  const isOnSite = stagingType === 'on_site';

  // Room add state
  const [selectedPreset, setSelectedPreset] = useState('');
  const [customRoomName, setCustomRoomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const allPresets = useMemo(() => getAllRoomPresets(), []);

  // Lock settings once first room is added
  const lockAndAddRoom = useCallback(() => {
    let name, presetId;
    if (showCustomInput) {
      if (!customRoomName.trim()) return;
      name = customRoomName.trim();
      presetId = null;
    } else {
      if (!selectedPreset) return;
      const preset = allPresets.find(p => p.id === selectedPreset);
      if (!preset) return;
      name = preset.name;
      presetId = preset.id;
    }
    if (!settingsLocked) setSettingsLocked(true);
    setRooms(prev => [...prev, {
      id: generateId(), name, presetId, photos: [], analyzing: false, analyzed: false,
      items: [], density: 'normal', roomSize: 'large', confidence: null, floor: '1st',
    }]);
    setSelectedPreset('');
    setCustomRoomName('');
  }, [showCustomInput, customRoomName, selectedPreset, allPresets, settingsLocked]);

  const removeRoom = useCallback((roomId) => {
    setRooms(prev => {
      const next = prev.filter(r => r.id !== roomId);
      if (next.length === 0) setSettingsLocked(false);
      return next;
    });
  }, []);

  const updateRoom = useCallback((roomId, updates) => {
    setRooms(prev => prev.map(r => r.id !== roomId ? r : { ...r, ...updates }));
  }, []);

  const addPhotosToRoom = useCallback((roomId, files) => {
    files.filter(f => f.type.startsWith('image/')).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setRooms(prev => prev.map(r => r.id === roomId
          ? { ...r, photos: [...r.photos, { id: generateId(), name: file.name, preview: ev.target.result }] }
          : r
        ));
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removePhoto = useCallback((roomId, photoId) => {
    setRooms(prev => prev.map(r => r.id === roomId
      ? { ...r, photos: r.photos.filter(p => p.id !== photoId) }
      : r
    ));
  }, []);

  const analyzeRoom = useCallback(async (roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room || room.photos.length === 0) return;

    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, analyzing: true } : r));
    try {
      const result = await api.photos.analyzeRoom(room.name, room.photos.map(p => p.preview));
      setRooms(prev => prev.map(r => r.id === roomId ? {
        ...r, analyzing: false, analyzed: true,
        items: (result.items || []).map(i => ({
          id: generateId(), name: i.name, category: i.category, quantity: i.quantity,
          isHighValue: i.is_high_value, estimatedValue: i.estimated_value,
          is_fragile: i.is_fragile || false,
          needs_disassembly: i.needs_disassembly || false,
          packing_method: i.packing_method || null,
          required_materials: i.required_materials || null,
          estimated_labor_hours: i.estimated_labor_hours || null,
          special_instructions: i.special_instructions || null,
          estimator_flags: i.estimator_flags || null,
        })),
        density: result.density || 'normal',
        roomSize: result.room_size || 'large',
        confidence: result.confidence_score || 0.7,
        field_notes: result.field_notes || [],
      } : r));
    } catch (err) {
      onError?.(err.message);
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, analyzing: false } : r));
    }
  }, [rooms, onError]);

  // Item editing
  const updateItem = useCallback((roomId, itemId, field, value) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const item = r.items.find(i => i.id === itemId);
      if (item) {
        const key = r.name;
        if (!correctionsBuffer.current[key]) correctionsBuffer.current[key] = [];
        correctionsBuffer.current[key].push({
          original_name: item.name,
          corrected_name: field === 'name' ? value : item.name,
          original_category: item.category,
          corrected_category: field === 'category' ? value : item.category,
          original_qty: item.quantity,
          corrected_qty: field === 'quantity' ? value : item.quantity,
          action: 'edit',
          match_confidence: item.match_confidence || null,
        });
      }
      return { ...r, items: r.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) };
    }));
  }, []);

  const removeItem = useCallback((roomId, itemId) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const item = r.items.find(i => i.id === itemId);
      if (item) {
        const key = r.name;
        if (!correctionsBuffer.current[key]) correctionsBuffer.current[key] = [];
        correctionsBuffer.current[key].push({
          original_name: item.name,
          action: 'delete',
          match_confidence: item.match_confidence || null,
        });
      }
      return { ...r, items: r.items.filter(i => i.id !== itemId) };
    }));
  }, []);

  const addItem = useCallback((roomId) => {
    setRooms(prev => prev.map(r => r.id === roomId ? {
      ...r, items: [...r.items, { id: generateId(), name: '', category: 'Other', quantity: 1, isHighValue: false, estimatedValue: null }]
    } : r));
  }, []);

  const generateEstimate = useCallback(async () => {
    const roomsWithItems = rooms.filter(r => r.items.length > 0);
    if (roomsWithItems.length === 0) {
      onError?.('Add rooms with items first');
      return;
    }

    setGenerating(true);
    try {
      // Save corrections first — await so they are guaranteed to persist
      // before the estimate is generated.
      const bufferSnapshot = { ...correctionsBuffer.current };
      correctionsBuffer.current = {};
      const correctionSaves = Object.entries(bufferSnapshot)
        .filter(([, corrections]) => corrections.length > 0)
        .map(([roomName, corrections]) =>
          api.photos.submitCorrections(null, roomName, corrections)
            .catch(err => console.warn(`Corrections save failed (${roomName}):`, err))
        );
      if (correctionSaves.length > 0) await Promise.all(correctionSaves);

      const result = await api.photos.estimateFromRooms(roomsWithItems, { crewSize, storageMonths: isOnSite ? 0 : storageMonths, includePackback, includeOp: true, opRate: 20, includeContingency: false, contingencyRate: 0, stagingType, region });
      setEstimateHours(result.total_hours || 0);
      onEstimate?.({
        rooms: result.total_rooms || roomsWithItems.length,
        items: result.total_items || 0,
        hours: result.total_hours || 0, crew: crewSize,
        materials: result.materials || {},
        materials_detail: result.materials_detail || {},
        sections: result.sections || {},
        section_details: result.section_details || {},
        subtotal: result.subtotal || 0, total: result.grand_total || 0,
        includeOP: result.include_op !== false, opRate: result.op_rate || 20,
        includeContingency: false, contingencyRate: 0,
        supplements: result.supplements || [],
        storageSf: snapToStorageUnit(result.storage_sf || 0), storageMonths: isOnSite ? 0 : storageMonths,
        stagingType,
        aiRooms: roomsWithItems, fromPhotoAI: true,
        propertyAddress,
      });
    } catch (err) {
      // Network error (backend offline) → generate estimate locally from AI-detected rooms
      const isNetworkError = err instanceof TypeError || err.message === 'Failed to fetch' || err.message.includes('NetworkError') || err.message.includes('fetch');
      if (isNetworkError && roomsWithItems.length > 0) {
        const allItems = roomsWithItems.flatMap(r => r.items || []);
        const totalQty = allItems.reduce((s, i) => s + (i.quantity || 1), 0);
        const estHours = Math.max(4, Math.round(totalQty * 0.3 * 10) / 10);
        const numRooms = roomsWithItems.length;
        const recCrew = numRooms <= 2 ? 2 : numRooms <= 4 ? 3 : numRooms <= 7 ? 4 : 5;
        setEstimateHours(estHours);
        onEstimate?.({
          rooms: numRooms,
          items: totalQty,
          hours: estHours,
          crew: crewSize || recCrew,
          materials: {},
          materials_detail: {},
          sections: {},
          section_details: {},
          subtotal: 0, total: 0,
          includeOP: true, opRate: 20,
          includeContingency: false, contingencyRate: 0,
          supplements: [],
          storageSf: snapToStorageUnit(Math.max(25, Math.ceil(totalQty * 2))),
          storageMonths: isOnSite ? 0 : storageMonths,
          stagingType,
          aiRooms: roomsWithItems, fromPhotoAI: true,
          propertyAddress,
        });
      } else {
        onError?.(err.message);
      }
    }
    finally { setGenerating(false); }
  }, [rooms, crewSize, storageMonths, includePackback, onEstimate, onError, propertyAddress, stagingType, isOnSite]);

  const totalItems = useMemo(() => rooms.reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0), [rooms]);
  const reviewStats = useMemo(() => {
    let hvCount = 0, fragileCount = 0, laborHrs = 0;
    rooms.forEach(r => {
      if (!r.analyzed) return;
      (r.items || []).forEach(i => {
        // Count unique item LINES (types), not total quantity
        if (i.isHighValue) hvCount += 1;
        if (i.is_fragile) fragileCount += 1;
        laborHrs += (i.estimated_labor_hours || 0);
      });
    });
    return { hvCount, fragileCount, laborHrs: Math.round(laborHrs * 10) / 10 };
  }, [rooms]);

  return (
    <div className="space-y-6">
      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxPhoto(null)}>
          <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full transition-colors"
            onClick={() => setLightboxPhoto(null)}>
            <X size={24} />
          </button>
          <div className="max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-2"
            onClick={e => e.stopPropagation()}>
            <img src={lightboxPhoto.preview} alt={lightboxPhoto.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
            <span className="text-white/70 text-sm">{lightboxPhoto.name}</span>
          </div>
        </div>
      )}

      {/* Project Settings — set once before adding rooms */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Settings size={18} /> Project Settings</h3>
        {/* Property Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            <MapPin size={14} /> Property Address
          </label>
          <input type="text" value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)}
            placeholder="123 Main St, City, State ZIP"
            disabled={settingsLocked}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${settingsLocked ? 'bg-gray-50 text-gray-500' : ''}`} />
        </div>
        {/* Staging Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Staging</label>
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => !settingsLocked && setStagingType('off_site')} className={`flex-1 px-3 py-2 text-sm font-medium ${!isOnSite ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} ${settingsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>Off-Site Storage</button>
            <button onClick={() => !settingsLocked && setStagingType('on_site')} className={`flex-1 px-3 py-2 text-sm font-medium ${isOnSite ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} ${settingsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>On-Site Staging</button>
          </div>
        </div>
        {/* Region */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            Region
            <span title="Adjusts labor cost based on local market rates. Auto-set from your company address." className="text-gray-400 cursor-help text-xs">ⓘ</span>
          </label>
          <select value={region} onChange={e => setRegion(e.target.value)} disabled={settingsLocked}
            className={`w-full border rounded-lg px-3 py-2 text-sm ${settingsLocked ? 'bg-gray-50 text-gray-500' : ''}`}>
            {REGION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        {/* Crew, Storage, Pack-back */}
        <div className={`grid ${isOnSite ? 'grid-cols-2' : 'grid-cols-3'} gap-4`}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Users size={14} /> Crew Size
            </label>
            <select value={crewSize} onChange={e => setCrewSize(+e.target.value)} disabled={settingsLocked}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${settingsLocked ? 'bg-gray-50 text-gray-500' : ''}`}>
              {[2,3,4,5,6].map(n => <option key={n} value={n}>{n} Person</option>)}
            </select>
          </div>
          {!isOnSite && <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Storage</label>
            <select value={storageMonths} onChange={e => setStorageMonths(+e.target.value)} disabled={settingsLocked}
              className={`w-full border rounded-lg px-3 py-2 text-sm ${settingsLocked ? 'bg-gray-50 text-gray-500' : ''}`}>
              {[0,1,2,3,6,12].map(n => <option key={n} value={n}>{n} Mo</option>)}
            </select>
          </div>}
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includePackback} onChange={e => setIncludePackback(e.target.checked)}
                disabled={settingsLocked} className="rounded" />
              <span className="text-sm">Pack-Back</span>
            </label>
          </div>
        </div>
        {settingsLocked && (
          <button onClick={() => setSettingsLocked(false)}
            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
            <Edit3 size={12} /> Edit Settings
          </button>
        )}
      </div>

      {/* Room Add Section */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Plus size={18} /> Add Room</h3>
        <div className="flex gap-2 items-end">
          {showCustomInput ? (
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Custom Room Name</label>
              <input type="text" value={customRoomName} onChange={e => setCustomRoomName(e.target.value)}
                placeholder="e.g. Sunroom, Wine Cellar..." className="w-full border rounded-lg px-3 py-2 text-sm"
                onKeyDown={e => e.key === 'Enter' && lockAndAddRoom()} />
            </div>
          ) : (
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Room Preset</label>
              <select value={selectedPreset} onChange={e => setSelectedPreset(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Select a room...</option>
                {Object.entries(ROOM_PRESETS).map(([cat, presets]) => (
                  <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                    {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}
          <button onClick={lockAndAddRoom} disabled={showCustomInput ? !customRoomName.trim() : !selectedPreset}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 whitespace-nowrap">
            <Plus size={14} className="inline mr-1" />Add
          </button>
          <button onClick={() => { setShowCustomInput(!showCustomInput); setSelectedPreset(''); setCustomRoomName(''); }}
            className="px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg whitespace-nowrap">
            {showCustomInput ? 'Use Preset' : 'Custom'}
          </button>
        </div>
      </div>

      {/* Room Cards — newest first */}
      {[...rooms].reverse().map((room) => (
        <RoomCard key={room.id} room={room}
          onRemoveRoom={removeRoom} onAddPhotos={addPhotosToRoom} onRemovePhoto={removePhoto}
          onAnalyze={analyzeRoom} onUpdateRoom={updateRoom} onUpdateItem={updateItem} onRemoveItem={removeItem} onAddItem={addItem}
          onPhotoPreview={setLightboxPhoto} apiConnected={apiConnected} />
      ))}

      {rooms.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Camera size={48} className="mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No rooms added yet</p>
          <p className="text-sm mt-1">Set project settings above, then add rooms for AI analysis</p>
        </div>
      )}

      {/* Summary + Generate */}
      {rooms.length > 0 && (
        <div className="space-y-4">
          {/* Project summary bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-700 flex flex-wrap items-center gap-x-2">
              {propertyAddress && <span className="mr-1 text-blue-500"><MapPin size={12} className="inline -mt-0.5" /> {propertyAddress}</span>}
              <span><span className="font-medium">{rooms.length}</span> room{rooms.length !== 1 ? 's' : ''}</span>
              <span>&bull;</span>
              <span><span className="font-medium">{crewSize}</span>-person crew</span>
              {reviewStats.laborHrs > 0 && <><span>&bull;</span><span><span className="font-medium">{reviewStats.laborHrs}</span> labor hrs</span></>}
              {reviewStats.hvCount > 0 && <><span>&bull;</span><span className="text-amber-600"><span className="font-medium">{reviewStats.hvCount}</span> high-value</span></>}
              {reviewStats.fragileCount > 0 && <><span>&bull;</span><span className="text-red-500"><span className="font-medium">{reviewStats.fragileCount}</span> fragile</span></>}
            </div>
            <div className="text-xs text-blue-500 whitespace-nowrap ml-3">{rooms.filter(r => r.analyzed).length}/{rooms.length} analyzed</div>
          </div>

          <MasterContentPanel rooms={rooms} estimateHours={estimateHours} />

          <button onClick={generateEstimate} disabled={generating || totalItems === 0}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2">
            {generating ? <Loader size={18} className="animate-spin" /> : <Sparkles size={18} />} Generate Estimate
          </button>
        </div>
      )}
    </div>
  );
});

// ============================================
// MASTER CONTENT PANEL
// ============================================
function MasterContentPanel({ rooms, estimateHours }) {
  const [open, setOpen] = useState(false);
  const masterItems = useMemo(() => {
    const itemMap = {};
    rooms.forEach(room => {
      if (!room.analyzed) return;
      (room.items || []).forEach(item => {
        const key = (item.name || '').toLowerCase().trim();
        if (!itemMap[key]) {
          itemMap[key] = {
            name: item.name,
            category: item.category,
            totalQty: 0,
            rooms: [],
            isHighValue: false,
            isFragile: false,
            flags: new Set(),
            totalLaborHrs: 0,
          };
        }
        const entry = itemMap[key];
        entry.totalQty += (item.quantity || 1);
        if (!entry.rooms.includes(room.name)) entry.rooms.push(room.name);
        if (item.isHighValue) entry.isHighValue = true;
        if (item.is_fragile) entry.isFragile = true;
        (item.estimator_flags || []).forEach(f => entry.flags.add(f));
        entry.totalLaborHrs += (item.estimated_labor_hours || 0); // AI returns total hrs for the line (qty already included)
      });
    });

    return Object.values(itemMap)
      .map(e => ({ ...e, flags: Array.from(e.flags) }))
      .sort((a, b) => b.isHighValue - a.isHighValue || b.totalQty - a.totalQty);
  }, [rooms]);

  const analyzedCount = rooms.filter(r => r.analyzed).length;
  if (analyzedCount < 2) return null;

  const hvCount = masterItems.filter(i => i.isHighValue).length;
  const fragileCount = masterItems.filter(i => i.isFragile).length;
  // Use backend total_hours when available (post-estimate); it accounts for crew division and overheads
  const displayHours = estimateHours != null ? estimateHours : null;

  return (
    <div className="mt-6 border rounded-xl overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-indigo-600 hover:bg-indigo-700 transition-colors px-4 py-3 flex items-center justify-between"
      >
        <h3 className="text-white font-semibold">Master Content List ({analyzedCount} Rooms)</h3>
        <div className="flex items-center gap-4 text-sm text-indigo-100">
          <span>{masterItems.length} items</span>
          {displayHours != null && <span>{displayHours.toFixed(1)} labor hrs</span>}
          {hvCount > 0 && <span className="text-yellow-300">&#11088; {hvCount} high-value</span>}
          {fragileCount > 0 && <span className="text-red-300">&#9888;&#65039; {fragileCount} fragile</span>}
          <span className="text-white ml-1">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Qty</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Rooms</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Flags</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Labor</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {masterItems.map((item, i) => (
                <tr key={i} className={item.isHighValue ? 'bg-yellow-50' : ''}>
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {item.isHighValue && <span className="text-yellow-500 mr-1">&#11088;</span>}
                    {item.isFragile && <span className="text-red-400 mr-1">&#9888;&#65039;</span>}
                    {item.name}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{item.category}</td>
                  <td className="px-4 py-2 text-center font-medium">{item.totalQty}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{item.rooms.join(', ')}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {item.flags.map(f => (
                        <span key={f} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{f}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">{item.totalLaborHrs.toFixed(1)}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const FLAG_COLORS = {
  HEAVY: 'bg-orange-100 text-orange-700 border-orange-200',
  HIGH_VALUE: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  FRAGILE: 'bg-red-100 text-red-600 border-red-200',
  CHECK_MOISTURE: 'bg-blue-100 text-blue-700 border-blue-200',
  DISASSEMBLY: 'bg-purple-100 text-purple-700 border-purple-200',
  TWO_MAN_LIFT: 'bg-orange-100 text-orange-700 border-orange-200',
  DOCUMENTS: 'bg-gray-100 text-gray-600 border-gray-200',
};

// Room Card Component
const RoomCard = memo(function RoomCard({ room, onRemoveRoom, onAddPhotos, onRemovePhoto, onAnalyze, onUpdateRoom, onUpdateItem, onRemoveItem, onAddItem, onPhotoPreview, apiConnected }) {
  const fileInputRef = useRef(null);
  const [expanded, setExpanded] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState(null);

  const handleFileSelect = useCallback((e) => {
    onAddPhotos(room.id, Array.from(e.target.files));
    e.target.value = '';
  }, [room.id, onAddPhotos]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    onAddPhotos(room.id, Array.from(e.dataTransfer.files));
  }, [room.id, onAddPhotos]);

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-gray-800">{room.name}</span>
          {room.presetId && <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded">preset</span>}
          {room.analyzed && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded flex items-center gap-1"><Check size={10} />analyzed</span>}
          <span className="text-xs text-gray-500">{room.photos.length} photo{room.photos.length !== 1 ? 's' : ''} &bull; {room.items.length} item{room.items.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onRemoveRoom(room.id); }} className="p-1 text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Photo Upload Area */}
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-blue-300 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={handleFileSelect} className="hidden" />
            <Camera size={20} className="mx-auto text-gray-400 mb-1" />
            <p className="text-sm text-gray-500">Drop photos or click to upload</p>
          </div>

          {/* Photo Thumbnails */}
          {room.photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {room.photos.map(p => (
                <div key={p.id} className="relative group aspect-square rounded-lg overflow-hidden border">
                  <img src={p.preview} alt={p.name} className="w-full h-full object-cover cursor-zoom-in"
                    onClick={() => onPhotoPreview(p)} />
                  <button onClick={() => onRemovePhoto(room.id, p.id)}
                    className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5 text-[10px] text-white truncate">{p.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* Analyze Button */}
          {room.photos.length > 0 && (
            <button onClick={() => onAnalyze(room.id)} disabled={room.analyzing || !apiConnected}
              className="w-full py-2 bg-purple-50 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-100 disabled:opacity-50 flex items-center justify-center gap-2">
              {room.analyzing ? <Loader size={16} className="animate-spin" /> : <Eye size={16} />}
              {room.analyzing ? 'Analyzing...' : room.analyzed ? 'Re-Analyze Photos' : 'Analyze Photos'}
            </button>
          )}

          {/* No photos available for re-analysis */}
          {room.photos.length === 0 && room.analyzed && room.items.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>No photos available. Upload photos above to re-analyze this room.</span>
            </div>
          )}

          {!apiConnected && room.photos.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 flex items-center gap-2 text-xs">
              <AlertTriangle size={14} className="text-yellow-600" /><span className="text-yellow-700">API connection required</span>
            </div>
          )}

          {/* Floor selector — always visible */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 shrink-0">Floor:</span>
            {['basement', '1st', '2nd', '3rd', '4th+'].map(f => (
              <button key={f} onClick={() => onUpdateRoom(room.id, { floor: f })}
                className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${(room.floor || '1st') === f ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {f}
              </button>
            ))}
          </div>

          {/* Confidence */}
          {room.confidence !== null && (
            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span>Density: <span className="font-medium text-gray-700">{room.density}</span> &bull; Size: <span className="font-medium text-gray-700">{room.roomSize}</span></span>
              <div className="flex items-center gap-1">
                <span>Confidence</span>
                <div className="w-16 h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${room.confidence * 100}%` }} /></div>
                <span className="font-medium">{Math.round(room.confidence * 100)}%</span>
              </div>
            </div>
          )}

          {/* Field Notes */}
          {room.field_notes?.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Field Notes</div>
              {room.field_notes.map((note, i) => (
                <div key={i} className="flex items-start gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                  <span className="mt-0.5">📋</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {/* Content Items Table */}
          {room.items.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">Content Items ({room.items.length})</h4>
                <button onClick={() => onAddItem(room.id)} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Plus size={12} />Add Item</button>
              </div>
              <div className="divide-y max-h-96 overflow-y-auto">
                {room.items.map(item => (
                  <div key={item.id}>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <input type="text" value={item.name} onChange={e => onUpdateItem(room.id, item.id, 'name', e.target.value)}
                          className="w-full border-0 bg-transparent px-1 py-0.5 text-sm focus:ring-1 focus:ring-blue-300 rounded" placeholder="Item name" />
                        {item.estimator_flags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5 px-1">
                            {item.estimator_flags.map(flag => (
                              <span key={flag} className={`text-xs px-1.5 py-0.5 rounded border ${FLAG_COLORS[flag] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{flag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <select value={item.category} onChange={e => onUpdateItem(room.id, item.id, 'category', e.target.value)}
                        className="border rounded px-2 py-1 text-xs bg-white w-28">
                        {ITEM_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input type="number" value={item.quantity} onChange={e => onUpdateItem(room.id, item.id, 'quantity', Math.max(1, +e.target.value))}
                        className="w-14 border rounded px-2 py-1 text-xs text-center" min={1} />
                      <label className="flex items-center gap-1 text-xs text-yellow-600 whitespace-nowrap" title="High Value">
                        <input type="checkbox" checked={item.isHighValue} onChange={e => onUpdateItem(room.id, item.id, 'isHighValue', e.target.checked)} className="rounded" />
                        <span>HV</span>
                      </label>
                      <button onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                        className="p-1 text-gray-400 hover:text-blue-500" title="Show packing details">
                        {expandedItemId === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button onClick={() => onRemoveItem(room.id, item.id)} className="p-1 text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                    {expandedItemId === item.id && (
                      <div className="px-4 py-3 bg-gray-50 border-t text-sm space-y-2">
                        {item.packing_method && (
                          <div>
                            <span className="font-medium text-gray-700">Packing Method: </span>
                            <span className="text-gray-600">{item.packing_method}</span>
                          </div>
                        )}
                        {item.required_materials?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="font-medium text-gray-700 mr-1">Materials:</span>
                            {item.required_materials.map(m => (
                              <span key={m} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-100">{m}</span>
                            ))}
                          </div>
                        )}
                        {item.estimated_labor_hours > 0 && (
                          <div className="text-gray-500">Labor: {item.estimated_labor_hours} hrs/item</div>
                        )}
                        {item.special_instructions && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-2 text-yellow-800">
                            &#9888;&#65039; {item.special_instructions}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add Item button when no items yet and not analyzed */}
          {room.items.length === 0 && room.photos.length === 0 && (
            <button onClick={() => onAddItem(room.id)}
              className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 flex items-center justify-center gap-2">
              <Plus size={14} /> Add items manually
            </button>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================
// QUICK ESTIMATE TAB (Room Presets + Content Hints)
// ============================================
const QuickEstimateTab = memo(function QuickEstimateTab({ onEstimate, onError, defaultRegion }) {
  const [selectedRooms, setSelectedRooms] = useState([]);
  const [expandedRoom, setExpandedRoom] = useState(null);
  const [activeCategory, setActiveCategory] = useState('bedroom');
  const [crewSize, setCrewSize] = useState(4);
  const [stagingType, setStagingType] = useState('off_site');
  const [storageMonths, setStorageMonths] = useState(1);
  const [includePackback, setIncludePackback] = useState(true);
  const [includeOP, setIncludeOP] = useState(true);
  const [opRate, setOpRate] = useState(20);
  const [showMaterials, setShowMaterials] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [region, setRegion] = useState(() => defaultRegion || 'mid_atlantic');
  const [specialItems, setSpecialItems] = useState([]);
  const [customSpecialItems, setCustomSpecialItems] = useState([]);
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSize, setCustomSize] = useState('large');
  const [customDensity, setCustomDensity] = useState('normal');
  const [customHints, setCustomHints] = useState([]);
  const [customHintQty, setCustomHintQty] = useState({});
  const [expandedQtyKey, setExpandedQtyKey] = useState(null); // "{roomId}:{hintKey}" or "custom:{hintKey}"
  const isOnSite = stagingType === 'on_site';

  const addRoom = useCallback((preset) => {
    // Default qty=1 for unit-based hints that are in the preset's default hints
    const hintQty = {};
    preset.defaultHints.forEach(h => { if (HINT_UNIT_MATERIALS[h]) hintQty[h] = 1; });
    setSelectedRooms(prev => [...prev, { id: generateId(), presetId: preset.id, name: preset.name, size: preset.size || 'large', baseItems: preset.baseItems, hours: preset.hours, hints: [...preset.defaultHints], hintQty, hintVolume: {}, density: 'normal', floor: '1st', contamination: 'clean' }]);
  }, []);

  const addCustomRoom = useCallback(() => {
    const name = customName.trim();
    if (!name) return;
    const sizeOpt = CUSTOM_SIZE_OPTIONS.find(o => o.value === customSize) || CUSTOM_SIZE_OPTIONS[1];
    const hintQty = {};
    customHints.forEach(h => { if (HINT_UNIT_MATERIALS[h]) hintQty[h] = customHintQty[h] || 1; });
    setSelectedRooms(prev => [...prev, {
      id: generateId(),
      presetId: sizeOpt.presetId,
      name,
      size: sizeOpt.size,
      baseItems: sizeOpt.baseItems,
      hours: sizeOpt.hours,
      hints: [...customHints],
      hintQty,
      density: customDensity, floor: '1st', contamination: 'clean',
      hintVolume: {},
      isCustom: true,
    }]);
    setCustomName('');
    setCustomDensity('normal');
    setCustomHints([]);
    setCustomHintQty({});
  }, [customName, customSize, customDensity, customHints]);

  const toggleCustomHint = useCallback((key) => {
    setCustomHints(prev => {
      const has = prev.includes(key);
      if (!has && HINT_UNIT_MATERIALS[key]) setCustomHintQty(q => ({ ...q, [key]: 1 }));
      if (has) setCustomHintQty(q => { const n = { ...q }; delete n[key]; return n; });
      return has ? prev.filter(h => h !== key) : [...prev, key];
    });
  }, []);
  
  const removeRoom = useCallback((roomId) => { setSelectedRooms(prev => prev.filter(r => r.id !== roomId)); if (expandedRoom === roomId) setExpandedRoom(null); }, [expandedRoom]);
  const duplicateRoom = useCallback((roomId) => { setSelectedRooms(prev => { const r = prev.find(x => x.id === roomId); return r ? [...prev, { ...r, id: generateId() }] : prev; }); }, []);
  const toggleHint = useCallback((roomId, hintKey) => {
    setSelectedRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const has = r.hints.includes(hintKey);
      const hints = has ? r.hints.filter(h => h !== hintKey) : [...r.hints, hintKey];
      const hintQty = { ...r.hintQty };
      if (!has && HINT_UNIT_MATERIALS[hintKey]) hintQty[hintKey] = 1;
      if (has) delete hintQty[hintKey];
      return { ...r, hints, hintQty };
    }));
  }, []);

  const setHintQty = useCallback((roomId, hintKey, qty) => {
    setSelectedRooms(prev => prev.map(r =>
      r.id !== roomId ? r : { ...r, hintQty: { ...r.hintQty, [hintKey]: qty } }
    ));
  }, []);

  const setHintVolume = useCallback((roomId, hintKey, levelIdx) => {
    setSelectedRooms(prev => prev.map(r =>
      r.id !== roomId ? r : { ...r, hintVolume: { ...(r.hintVolume || {}), [hintKey]: levelIdx } }
    ));
  }, []);

  const calculatedMaterials = useMemo(() => {
    const floats = {};
    selectedRooms.forEach(room => {
      room.hints.forEach(hk => {
        const unitMats = HINT_UNIT_MATERIALS[hk];
        if (unitMats) {
          // Unit-based: qty × per-unit material
          const qty = (room.hintQty || {})[hk] || 1;
          Object.entries(unitMats).forEach(([m, perUnit]) => {
            floats[m] = (floats[m] || 0) + qty * perUnit;
          });
        } else {
          // Factor-based: room size × density × hint volume level × factor
          const volLevels = HINT_VOLUME_LEVELS[hk];
          const volLevelIdx = (room.hintVolume || {})[hk] ?? 1; // default M
          const hintVolMult = volLevels ? (volLevels[volLevelIdx]?.mult ?? 1.0) : 1.0;
          const volScale = (MAT_SCALE_PER_SIZE[room.size] || 80) * (DENSITY_MULT[room.density] || 1.0) * hintVolMult;
          const h = CONTENT_HINTS[hk];
          if (h && h.materials) Object.entries(h.materials).forEach(([m, f]) => {
            floats[m] = (floats[m] || 0) + volScale * f;
          });
        }
      });
    });
    const mats = {};
    Object.entries(floats).forEach(([m, v]) => { mats[m] = Math.max(1, Math.ceil(v)); });
    return mats;
  }, [selectedRooms]);
  
  const summary = useMemo(() => {
    const rooms = selectedRooms.length;
    const hours = Math.round(selectedRooms.reduce((s, r) => s + roomEffectiveHours(r), 0) * (includePackback ? 1.8 : 1) * 10) / 10;
    const totalCf = selectedRooms.reduce((s, r) => s + (CF_PER_ROOM_SIZE[r.size] || 150) * (DENSITY_MULT[r.density] || 1.0), 0);
    const rawSf = selectedRooms.reduce((s, r) => s + (SF_PER_ROOM_SIZE[r.size] || 40), 0);
    const estStorageSf = rawSf > 0 ? snapToStorageUnit(rawSf) : 0;
    return { rooms, totalCf, hours, storageSf: isOnSite ? 0 : estStorageSf };
  }, [selectedRooms, includePackback, isOnSite]);

  const handleCalculate = useCallback(async () => {
    if (selectedRooms.length === 0) return;
    setCalculating(true);
    try {
      const result = await api.estimates.create({
        rooms: selectedRooms.map(r => ({
          preset: r.presetId,
          floor: r.floor || '1st',
          density: r.density || 'normal',
          hints: r.hints || [],
          contamination: r.contamination || 'clean',
          hint_qty: r.hintQty || {},
          hint_volume: r.hintVolume || {},
        })),
        crew_size: crewSize,
        storage_months: isOnSite ? 0 : storageMonths,
        staging_type: stagingType,
        include_packback: includePackback,
        include_op: includeOP,
        op_rate: opRate,
        include_contingency: false,
        contingency_rate: 0,
        region,
        special_items: specialItems,
        custom_special_items: customSpecialItems,
      });
      onEstimate({
        rooms: result.total_rooms, items: result.total_items,
        hours: result.total_hours, crew: crewSize,
        materials: result.materials || {},
        materials_detail: result.materials_detail || {},
        sections: result.sections || {},
        section_details: result.section_details || {},
        subtotal: result.subtotal, total: result.grand_total,
        includeOP: result.include_op !== false, opRate: result.op_rate || opRate,
        includeContingency: false, contingencyRate: 0,
        supplements: result.supplements || [],
        storageSf: result.storage_sf || 0, storageMonths: isOnSite ? 0 : storageMonths,
        stagingType, selectedRooms,
      });
    } catch (err) {
      onError?.('Failed to generate estimate: server unavailable. Please check the backend is running and try again.');
    } finally {
      setCalculating(false);
    }
  }, [selectedRooms, crewSize, storageMonths, stagingType, includePackback, includeOP, opRate, isOnSite, onEstimate]);
  const currentPresets = ROOM_PRESETS[activeCategory] || [];
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-1 overflow-x-auto pb-2">{ROOM_CATEGORIES.map(cat => <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-3 py-1.5 text-sm rounded-full whitespace-nowrap ${activeCategory === cat.id ? (cat.id === 'custom' ? 'bg-green-500 text-white' : 'bg-blue-500 text-white') : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{cat.name}</button>)}</div>

        {activeCategory === 'custom' ? (
          <div className="border rounded-xl p-5 bg-green-50/40 space-y-4">
            <h4 className="font-semibold text-gray-700">Custom Room</h4>

            {/* Room name */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Room Name <span className="text-red-400">*</span></label>
              <input
                type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                placeholder="e.g. Sunroom, Nursery, Wine Cellar..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-400 focus:border-transparent"
                onKeyDown={e => e.key === 'Enter' && addCustomRoom()}
              />
            </div>

            {/* Size */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Room Size</label>
              <div className="flex gap-1.5">
                {CUSTOM_SIZE_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setCustomSize(opt.value)}
                    className={`flex-1 py-2 px-2 rounded-lg border text-sm font-medium transition-colors text-center ${customSize === opt.value ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
                    <div>{opt.label}</div>
                    <div className={`text-[10px] mt-0.5 leading-tight ${customSize === opt.value ? 'text-green-100' : 'text-gray-400'}`}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Density */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Density</label>
              <select value={customDensity} onChange={e => setCustomDensity(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-green-400 focus:border-transparent">
                <option value="light">Light</option>
                <option value="normal">Normal</option>
                <option value="dense">Dense</option>
                <option value="heavy">Heavy</option>
                <option value="extreme">Extreme (hoarding)</option>
              </select>
            </div>

            {/* Content hints */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Contents <span className="text-gray-400">(select all that apply)</span></label>
              <div className="space-y-3">
                {Object.entries(
                  Object.entries(CONTENT_HINTS).reduce((acc, [key, hint]) => {
                    if (!acc[hint.category]) acc[hint.category] = [];
                    acc[hint.category].push([key, hint]);
                    return acc;
                  }, {})
                ).map(([cat, entries]) => (
                  <div key={cat}>
                    <div className="text-xs text-gray-400 font-medium mb-1.5">{cat}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {entries.map(([key, hint]) => {
                        const isUnit = !!HINT_UNIT_MATERIALS[key];
                        const checked = customHints.includes(key);
                        const qty = customHintQty[key] || 1;
                        return (
                          <div key={key} className="flex items-center gap-1">
                            <label className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs cursor-pointer select-none transition-colors ${checked ? 'bg-green-50 border-green-400 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:border-green-300'}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCustomHint(key)} className="sr-only" />
                              {hint.name}
                            </label>
                            {isUnit && checked && (() => {
                              const expandKey = `custom:${key}`;
                              const isExpanded = expandedQtyKey === expandKey;
                              return isExpanded ? (
                                <div className="flex gap-0.5">
                                  {QTY_CHIPS.map(chip => (
                                    <button key={chip.label}
                                      onClick={() => { setCustomHintQty(q => ({ ...q, [key]: chip.value })); setExpandedQtyKey(null); }}
                                      className={`w-6 h-5 text-[10px] rounded font-semibold transition-colors ${qty === chip.value ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                      {chip.label}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <button onClick={() => setExpandedQtyKey(expandKey)}
                                  className="w-5 h-5 rounded-full bg-green-100 text-green-600 text-[10px] font-bold hover:bg-green-200 transition-colors">
                                  {qty >= 6 ? '5+' : qty}
                                </button>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={addCustomRoom} disabled={!customName.trim()}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
              <Plus size={16} /> Add Custom Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {currentPresets.map(p => <button key={p.id} onClick={() => addRoom(p)} className="p-3 border rounded-lg hover:border-blue-400 hover:bg-blue-50 text-left"><div className="font-medium text-sm">{p.name}</div><div className="flex flex-wrap gap-1 mt-2">{p.defaultHints.slice(0, 3).map(h => <span key={h} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{CONTENT_HINTS[h] ? CONTENT_HINTS[h].name.split(' ')[0] : h}</span>)}{p.defaultHints.length > 3 && <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-400">+{p.defaultHints.length - 3}</span>}</div></button>)}
          </div>
        )}
        {selectedRooms.length > 0 && <div className="space-y-2 mt-4"><div className="flex justify-between"><h3 className="font-semibold">Selected Rooms ({selectedRooms.length})</h3><button onClick={() => setSelectedRooms([])} className="text-sm text-red-500">Clear</button></div>
          <div className="border rounded-lg divide-y">{selectedRooms.map((room, i) => <div key={room.id} className="bg-white">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs text-gray-300 w-5">{i + 1}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{room.name}</span>
                  {room.isCustom && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">custom</span>}
                </div>
                <div className="text-xs text-gray-400 flex gap-2 flex-wrap mt-0.5">
                  {room.density !== 'normal' && <span className="text-orange-500">{room.density}</span>}
                  {room.floor !== '1st' && <span className="text-blue-500">{room.floor}</span>}
                  {room.contamination !== 'clean' && <span className="text-red-500">{room.contamination.replace('_', ' ')}</span>}
                </div>
              </div>
              <button onClick={() => setExpandedRoom(expandedRoom === room.id ? null : room.id)} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">{expandedRoom === room.id ? 'Hide' : 'Customize'}</button>
              <button onClick={() => duplicateRoom(room.id)} className="p-1 text-gray-400 hover:text-blue-500"><Copy size={16} /></button>
              <button onClick={() => removeRoom(room.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
            {expandedRoom === room.id && (
              <div className="px-4 pb-4 pt-2 bg-gray-50 border-t space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Density</div>
                    <select value={room.density || 'normal'} onChange={e => setSelectedRooms(prev => prev.map(r => r.id !== room.id ? r : { ...r, density: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm bg-white">
                      {['light','normal','dense','heavy','extreme'].map(d => <option key={d} value={d}>{d === 'extreme' ? 'Extreme (hoarding)' : d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Floor</div>
                    <select value={room.floor || '1st'} onChange={e => setSelectedRooms(prev => prev.map(r => r.id !== room.id ? r : { ...r, floor: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm bg-white">
                      {['basement','1st','2nd','3rd','4th+'].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Contamination</div>
                    <select value={room.contamination || 'clean'} onChange={e => setSelectedRooms(prev => prev.map(r => r.id !== room.id ? r : { ...r, contamination: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm bg-white">
                      {CONTAMINATION_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-2">Content Hints</div>
                  {(() => {
                    const preset = findRoomPreset(room.presetId);
                    const relevantKeys = room.isCustom
                      ? Object.keys(CONTENT_HINTS)
                      : [...new Set([...(preset?.defaultHints || []), ...(preset?.suggestedHints || [])])];
                    const grouped = {};
                    relevantKeys.forEach(k => {
                      const h = CONTENT_HINTS[k];
                      if (!h) return;
                      if (!grouped[h.category]) grouped[h.category] = [];
                      grouped[h.category].push(k);
                    });
                    return (
                      <div className="space-y-2">
                        {Object.entries(grouped).map(([cat, keys]) => (
                          <div key={cat}>
                            <div className="text-xs text-gray-400 mb-1">{cat}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {keys.map(k => {
                                const h = CONTENT_HINTS[k];
                                const checked = room.hints.includes(k);
                                const isUnit = !!HINT_UNIT_MATERIALS[k];
                                const qty = (room.hintQty || {})[k] || 1;
                                const expandKey = `${room.id}:${k}`;
                                const isExpanded = expandedQtyKey === expandKey;
                                const volLevels = HINT_VOLUME_LEVELS[k];
                                const isVolume = !isUnit && !!volLevels;
                                const volIdx = (room.hintVolume || {})[k] ?? 1;
                                const curLevel = volLevels?.[volIdx];
                                return (
                                  <div key={k} className="flex flex-wrap items-center gap-1">
                                    <label className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs cursor-pointer select-none transition-colors ${checked ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}>
                                      <input type="checkbox" checked={checked} onChange={() => toggleHint(room.id, k)} className="sr-only" />
                                      {h.name}
                                    </label>
                                    {isUnit && checked && (
                                      isExpanded ? (
                                        <div className="flex gap-0.5">
                                          {QTY_CHIPS.map(chip => (
                                            <button key={chip.label}
                                              onClick={() => { setHintQty(room.id, k, chip.value); setExpandedQtyKey(null); }}
                                              className={`w-6 h-5 text-[10px] rounded font-semibold transition-colors ${qty === chip.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                              {chip.label}
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <button onClick={() => setExpandedQtyKey(expandKey)}
                                          className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold hover:bg-blue-200 transition-colors">
                                          {qty >= 6 ? '5+' : qty}
                                        </button>
                                      )
                                    )}
                                    {isVolume && checked && (
                                      isExpanded ? (
                                        <>
                                          <div className="flex gap-0.5">
                                            {volLevels.map((lv, i) => (
                                              <button key={lv.key}
                                                title={`${lv.label} — ${lv.hint}`}
                                                onClick={() => { setHintVolume(room.id, k, i); setExpandedQtyKey(null); }}
                                                className={`px-1.5 h-5 text-[10px] rounded font-semibold transition-colors ${volIdx === i ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                                                {lv.key}
                                              </button>
                                            ))}
                                          </div>
                                          {curLevel && (
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap">{curLevel.label} · {curLevel.hint}</span>
                                          )}
                                        </>
                                      ) : (
                                        <button onClick={() => setExpandedQtyKey(expandKey)}
                                          className="h-5 px-1.5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold hover:bg-blue-200 transition-colors">
                                          {curLevel?.key ?? 'M'}
                                        </button>
                                      )
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>)}</div>
        </div>}
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold">Settings</h3>
        <div className="space-y-3">
          <div><label className="block text-sm text-gray-500 mb-1">Crew Size</label><select value={crewSize} onChange={e => setCrewSize(+e.target.value)} className="w-full border rounded-lg px-3 py-2">{[2,3,4,5,6].map(n => <option key={n} value={n}>{n} Person</option>)}</select></div>
          <div>
            <label className="block text-sm text-gray-500 mb-1 flex items-center gap-1.5">
              Region
              <span title="Adjusts labor cost based on local market rates. Auto-set from your company address." className="text-gray-400 cursor-help text-xs">ⓘ</span>
            </label>
            <select value={region} onChange={e => setRegion(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {REGION_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div><label className="block text-sm text-gray-500 mb-1">Staging</label><div className="flex rounded-lg border overflow-hidden"><button onClick={() => setStagingType('off_site')} className={`flex-1 px-3 py-2 text-sm font-medium ${!isOnSite ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Off-Site Storage</button><button onClick={() => setStagingType('on_site')} className={`flex-1 px-3 py-2 text-sm font-medium ${isOnSite ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>On-Site Staging</button></div></div>
          {!isOnSite && <div><label className="block text-sm text-gray-500 mb-1">Storage Duration</label><select value={storageMonths} onChange={e => setStorageMonths(+e.target.value)} className="w-full border rounded-lg px-3 py-2">{[1,2,3,6,12].map(n => <option key={n} value={n}>{n} Mo</option>)}</select></div>}
          <label className="flex items-center gap-2 p-2 bg-gray-50 rounded"><input type="checkbox" checked={includePackback} onChange={e => setIncludePackback(e.target.checked)} className="rounded" /><span className="text-sm">Pack-Back</span></label>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Special Items</label>
            <div className="space-y-1.5 p-2 border rounded-lg bg-gray-50">
              {SPECIAL_ITEMS_OPTIONS.map(s => (
                <label key={s.value} className="flex items-center justify-between gap-2 text-sm cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input type="checkbox" checked={specialItems.includes(s.value)} onChange={e => setSpecialItems(prev => e.target.checked ? [...prev, s.value] : prev.filter(x => x !== s.value))} className="rounded" />
                    {s.label}
                  </span>
                  <span className="text-gray-400 text-xs">${s.price}</span>
                </label>
              ))}
              {customSpecialItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-gray-700">
                    <span className="w-3.5 h-3.5 rounded border border-blue-400 bg-blue-100 inline-block shrink-0" />
                    {item.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-gray-400 text-xs">${item.price}</span>
                    <button onClick={() => setCustomSpecialItems(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={13} /></button>
                  </span>
                </div>
              ))}
              <div className="flex gap-1.5 pt-1 border-t border-gray-200">
                <input
                  type="text"
                  placeholder="Item name"
                  value={customItemName}
                  onChange={e => setCustomItemName(e.target.value)}
                  className="flex-1 border rounded px-2 py-1 text-xs min-w-0"
                />
                <input
                  type="number"
                  placeholder="$"
                  value={customItemPrice}
                  onChange={e => setCustomItemPrice(e.target.value)}
                  className="w-16 border rounded px-2 py-1 text-xs"
                  min="0"
                />
                <button
                  onClick={() => {
                    const name = customItemName.trim();
                    const price = parseFloat(customItemPrice);
                    if (!name || isNaN(price) || price < 0) return;
                    setCustomSpecialItems(prev => [...prev, { name, price }]);
                    setCustomItemName('');
                    setCustomItemPrice('');
                  }}
                  className="px-2 py-1 bg-gray-700 text-white rounded text-xs hover:bg-gray-900"
                >Add</button>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t pt-4"><h3 className="font-semibold mb-3">Summary</h3><div className="grid grid-cols-2 gap-2 text-sm mb-4"><div className="bg-gray-50 p-3 rounded"><div className="text-xl font-bold">{summary.rooms}</div><div className="text-gray-500">Rooms</div></div><div className="bg-gray-50 p-3 rounded"><div className="text-xl font-bold">{summary.totalCf.toLocaleString()}</div><div className="text-gray-500">Cu.Ft</div></div><div className="bg-gray-50 p-3 rounded"><div className="text-xl font-bold">{Number.isInteger(summary.hours) ? summary.hours : summary.hours.toFixed(1)}</div><div className="text-gray-500">Hours</div></div><div className="bg-gray-50 p-3 rounded"><div className="text-xl font-bold">{crewSize}</div><div className="text-gray-500">Crew</div></div></div></div>
        <div className="border rounded-lg overflow-hidden"><button onClick={() => setShowMaterials(!showMaterials)} className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100"><span className="font-medium text-sm">Materials</span>{showMaterials ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{showMaterials && <div className="p-4 space-y-2 max-h-48 overflow-y-auto">{Object.keys(calculatedMaterials).length === 0 ? <p className="text-sm text-gray-400 text-center">Add rooms</p> : Object.entries(calculatedMaterials).map(([k, q]) => <div key={k} className="flex justify-between text-sm"><span>{k.replace(/_/g, ' ')}</span><span className="font-medium">{q}</span></div>)}</div>}</div>
        <div className="border rounded-lg p-4 space-y-3"><div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeOP} onChange={e => setIncludeOP(e.target.checked)} className="rounded" />O&P</label>{includeOP && <select value={opRate} onChange={e => setOpRate(+e.target.value)} className="border rounded px-2 py-1 text-sm">{[10,15,20,25].map(r => <option key={r} value={r}>{r}%</option>)}</select>}</div><div className="text-xs text-gray-400 pt-2 border-t">Supplements auto-detected based on room conditions</div></div>
        <button onClick={handleCalculate} disabled={selectedRooms.length === 0 || calculating} className="w-full py-3 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:bg-gray-300 flex items-center justify-center gap-2">{calculating ? <Loader size={18} className="animate-spin" /> : <Calculator size={18} />} Generate Estimate</button>
      </div>
    </div>
  );
});

// ============================================
// HISTORY TAB
// ============================================
const HistoryTab = memo(function HistoryTab({ apiConnected, onView, onError }) {
  const [estimates, setEstimates] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const loadEstimates = useCallback(async () => {
    if (!apiConnected) return;
    setLoading(true);
    try { setEstimates((await api.estimates.list({ limit: 50 })).estimates || []); }
    catch (err) { onError?.(err.message); }
    finally { setLoading(false); }
  }, [apiConnected, onError]);
  
  useEffect(() => { loadEstimates(); }, [loadEstimates]);
  
  const handleDelete = useCallback(async (id) => {
    if (!confirm('Delete this estimate?')) return;
    try { await api.estimates.delete(id); loadEstimates(); }
    catch (err) { onError?.(err.message); }
  }, [loadEstimates, onError]);
  
  if (!apiConnected) return <div className="text-center py-12 text-gray-400">Connect to API to view saved estimates</div>;
  if (loading) return <div className="text-center py-12"><Loader size={24} className="animate-spin mx-auto text-gray-400" /></div>;
  if (estimates.length === 0) return <div className="text-center py-12 text-gray-400">No saved estimates yet</div>;
  
  return (
    <div className="space-y-2">
      {estimates.map(est => (
        <div key={est.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
          <div>
            <div className="font-medium">{est.client_name || 'Unnamed'}</div>
            <div className="text-sm text-gray-400">{est.property_address || 'No address'} • {new Date(est.created_at).toLocaleDateString()}</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-bold text-lg">${est.estimate_data?.grand_total?.toFixed(2) || '0.00'}</span>
            <button onClick={() => onView?.(est)} className="p-2 text-gray-400 hover:text-blue-500"><Eye size={18} /></button>
            <button onClick={() => handleDelete(est.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
          </div>
        </div>
      ))}
    </div>
  );
});

// ============================================
// PRICE MANAGEMENT TAB
// ============================================
const CATEGORY_ORDER = ['labor', 'room', 'box', 'mattress', 'protective', 'transport', 'storage'];
const CATEGORY_LABELS = { labor: 'Labor', room: 'Room Rates', box: 'Boxes', mattress: 'Mattress', protective: 'Protective', transport: 'Transport', storage: 'Storage' };

const PriceManagementTab = memo(function PriceManagementTab({ apiConnected, onError }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ code: '', name: '', category: 'labor', unit: 'EA', price: '' });
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});

  const loadPrices = useCallback(async () => {
    if (!apiConnected) return;
    setLoading(true);
    try {
      const data = await api.prices.getAll();
      setPrices(data.prices || {});
    } catch (err) { onError?.(err.message); }
    finally { setLoading(false); }
  }, [apiConnected, onError]);

  useEffect(() => { loadPrices(); }, [loadPrices]);

  const pricesByCategory = useMemo(() => {
    const grouped = {};
    Object.values(prices).forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = [];
      grouped[p.category].push(p);
    });
    // Sort items within each category by code
    Object.values(grouped).forEach(items => items.sort((a, b) => a.code.localeCompare(b.code)));
    return grouped;
  }, [prices]);

  const filteredCategories = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return pricesByCategory;
    const filtered = {};
    Object.entries(pricesByCategory).forEach(([cat, items]) => {
      const matched = items.filter(p => p.name.toLowerCase().includes(term) || p.code.includes(term));
      if (matched.length) filtered[cat] = matched;
    });
    return filtered;
  }, [pricesByCategory, searchTerm]);

  const sortedCategories = useMemo(() => {
    const keys = Object.keys(filteredCategories);
    return keys.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [filteredCategories]);

  const startEdit = (p) => {
    setEditingCode(p.code);
    setEditForm({ name: p.name, price: p.price, category: p.category, unit: p.unit });
  };

  const cancelEdit = () => { setEditingCode(null); setEditForm({}); };

  const saveEdit = async (code) => {
    setSaving(true);
    try {
      const updates = {};
      const orig = prices[code];
      if (editForm.name !== orig.name) updates.name = editForm.name;
      if (editForm.price !== orig.price) updates.price = parseFloat(editForm.price);
      if (editForm.category !== orig.category) updates.category = editForm.category;
      if (editForm.unit !== orig.unit) updates.unit = editForm.unit;
      if (Object.keys(updates).length === 0) { cancelEdit(); return; }
      await api.prices.update(code, updates);
      await loadPrices();
      setEditingCode(null);
    } catch (err) { onError?.(err.message); }
    finally { setSaving(false); }
  };

  const handleAdd = async () => {
    if (!addForm.code || !addForm.name || !addForm.price) { onError?.('Code, Name, and Price are required'); return; }
    setSaving(true);
    try {
      await api.prices.create({ ...addForm, price: parseFloat(addForm.price) });
      await loadPrices();
      setShowAddForm(false);
      setAddForm({ code: '', name: '', category: 'labor', unit: 'EA', price: '' });
    } catch (err) { onError?.(err.message); }
    finally { setSaving(false); }
  };

  const toggleCategory = (cat) => setCollapsedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const totalItems = Object.values(prices).length;

  if (!apiConnected) return <div className="text-center py-12 text-gray-400">Connect to API to manage prices</div>;
  if (loading) return <div className="text-center py-12"><Loader size={24} className="animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold">Price Management</h2>
          <p className="text-sm text-gray-400">{totalItems} items across {Object.keys(pricesByCategory).length} categories</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Search by name or code..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 flex items-center gap-1.5">
            <Plus size={16} /> Add Item
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50">
          <h3 className="font-semibold text-sm mb-3">New Price Item</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Code *</label>
              <input type="text" value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))}
                placeholder="e.g. 3100" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input type="text" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Packing Tape" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {CATEGORY_ORDER.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Unit</label>
              <select value={addForm.unit} onChange={e => setAddForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm">
                {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Price *</label>
              <input type="number" step="0.01" min="0" value={addForm.price}
                onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0.00" className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAdd} disabled={saving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:bg-gray-300 flex items-center gap-1.5">
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Price Table by Category */}
      {sortedCategories.length === 0 && (
        <div className="text-center py-8 text-gray-400">No items match your search</div>
      )}
      {sortedCategories.map(cat => (
        <div key={cat} className="border rounded-lg overflow-hidden">
          <button onClick={() => toggleCategory(cat)}
            className="w-full flex justify-between items-center px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{CATEGORY_LABELS[cat] || cat}</span>
              <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{filteredCategories[cat].length}</span>
            </div>
            {collapsedCategories[cat] ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {!collapsedCategories[cat] && (
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 border-b">
                  <th className="text-left px-4 py-2 w-20">Code</th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2 w-16">Unit</th>
                  <th className="text-right px-4 py-2 w-28">Price</th>
                  <th className="text-right px-4 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCategories[cat].map(p => (
                  <tr key={p.code} className="hover:bg-gray-50 transition-colors">
                    {editingCode === p.code ? (
                      <>
                        <td className="px-4 py-2 text-sm font-mono text-gray-500">{p.code}</td>
                        <td className="px-4 py-2">
                          <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={editForm.unit} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))}
                            className="border rounded px-1 py-1 text-sm">
                            {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" step="0.01" min="0" value={editForm.price}
                            onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                            className="w-full border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => saveEdit(p.code)} disabled={saving}
                              className="p-1 text-green-600 hover:bg-green-50 rounded">
                              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                            </button>
                            <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-sm font-mono text-gray-400">{p.code}</td>
                        <td className="px-4 py-2 text-sm font-medium">{p.name}</td>
                        <td className="px-4 py-2 text-sm text-gray-500">{p.unit}</td>
                        <td className="px-4 py-2 text-sm text-right font-medium">${p.price.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right">
                          <button onClick={() => startEdit(p)} className="p-1 text-gray-400 hover:text-blue-500 rounded hover:bg-blue-50">
                            <PencilLine size={14} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
});

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [tab, setTab] = useState('quick');
  const [modal, setModal] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState(null);
  const [apiConnected, setApiConnected] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({ name: '', address: '', phone: '', email: '' });
  const [photoSettings, setPhotoSettings] = useState({ dedup_threshold: 0.95, max_images: 6 });
  const [defaultRegion, setDefaultRegion] = useState('mid_atlantic');
  const [continueRooms, setContinueRooms] = useState(null);
  const [continueCustomerInfo, setContinueCustomerInfo] = useState(null);

  useEffect(() => {
    const checkApi = async () => {
      try {
        await fetch(`${API_BASE.replace('/api', '')}/health`);
        setApiConnected(true);
        const [company, photo] = await Promise.all([api.settings.getCompany(), api.settings.getPhoto()]);
        setCompanyInfo(company);
        setPhotoSettings(photo);
        const detected = regionFromAddress(company.address);
        if (detected) setDefaultRegion(detected);
      } catch {
        setApiConnected(false);
      }
    };
    checkApi();
    const interval = setInterval(checkApi, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const handleEstimate = useCallback((data) => {
    setEstimate(prev => {
      const customerInfo = continueCustomerInfo || {};
      return { ...data, ...customerInfo, _key: Date.now() };
    });
    setContinueCustomerInfo(null);
    setModal('editor');
  }, [continueCustomerInfo]);
  const handleAddRooms = useCallback((currentEstimateData) => {
    const apiBase = API_BASE.replace('/api', '');
    const rooms = (currentEstimateData.aiRooms || []).map(r => ({
      ...r,
      photos: (r.photos || []).map(p => ({
        id: p.id || generateId(),
        name: p.name || 'photo',
        preview: p.url ? `${apiBase}${p.url}` : p.preview || null,
        url: p.url || null,
      })).filter(p => p.preview),
    }));
    setContinueRooms(rooms);
    setContinueCustomerInfo({
      clientName: currentEstimateData.clientName || '',
      clientPhone: currentEstimateData.clientPhone || '',
      clientEmail: currentEstimateData.clientEmail || '',
      notes: currentEstimateData.notes || '',
      propertyAddress: currentEstimateData.propertyAddress || '',
    });
    setModal(null);
    setTab('photo');
  }, []);
  const handleViewEstimate = useCallback((est) => {
    const d = est.estimate_data || {};
    const apiBase = API_BASE.replace('/api', '');
    const loadedAiRooms = (d.ai_rooms || []).map(r => ({
      ...r,
      photos: (r.photos || []).map(p => ({
        id: p.id || generateId(),
        name: p.name || 'photo',
        preview: p.url ? `${apiBase}${p.url}` : p.preview || null,
        url: p.url || null,
      })).filter(p => p.preview),
    }));
    setEstimate({ rooms: d.total_rooms || 0, items: d.total_items || 0,
      hours: d.total_hours || 0, crew: d.crew_size || 4,
      materials: d.materials || {}, subtotal: d.subtotal || 0, total: d.grand_total || 0,
      includeOP: d.include_op !== false, opRate: d.op_rate || 10,
      includeContingency: false, contingencyRate: 0,
      supplements: d.supplements || [],
      aiRooms: loadedAiRooms,
      fromPhotoAI: d.from_photo_ai || (d.ai_rooms && d.ai_rooms.length > 0),
      storageSf: d.storage_sf || 0,
      storageMonths: d.storage_months || 1,
      stagingType: d.staging_type || 'off_site',
      propertyAddress: est.property_address || d.property_address || '',
      clientName: est.client_name || '',
      clientPhone: est.client_phone || '',
      clientEmail: est.client_email || '',
      notes: est.notes || '',
      selectedRooms: d.selected_rooms || [],
      lineItems: d.line_items || [],
      savedEstimateId: est.id });
    setModal('editor');
  }, []);
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold tracking-tight">Moving Estimator Pro</h1>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 text-xs ${apiConnected ? 'text-green-600' : 'text-red-500'}`}>
              <div className={`w-2 h-2 rounded-full ${apiConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {apiConnected ? 'Connected' : 'Offline'}
            </div>
            <button onClick={() => setModal('company')} className="text-sm text-gray-500 hover:text-black flex items-center gap-1.5">
              <Settings size={16} /> Company
            </button>
          </div>
        </div>
      </header>
      
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 z-50 animate-pulse">
          <AlertTriangle size={18} />{error}
          <button onClick={() => setError(null)}><X size={16} /></button>
        </div>
      )}
      
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {[{ id: 'quick', label: 'Quick Estimate', icon: Calculator }, { id: 'photo', label: 'Photo AI', icon: Camera }, { id: 'history', label: 'History', icon: FileText }, { id: 'prices', label: 'Prices', icon: DollarSign }].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-5 py-3 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                tab === id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              <Icon size={18} />{label}
            </button>
          ))}
        </div>
        
        <div className="bg-white rounded-xl p-6 shadow-sm border">
          {tab === 'quick' && <QuickEstimateTab onEstimate={handleEstimate} onError={setError} defaultRegion={defaultRegion} />}
          {tab === 'photo' && <PhotoAnalysisTab onEstimate={handleEstimate} onError={setError} apiConnected={apiConnected} initialRooms={continueRooms} onMounted={() => setContinueRooms(null)} defaultRegion={defaultRegion} />}
          {tab === 'history' && <HistoryTab apiConnected={apiConnected} onView={handleViewEstimate} onError={setError} />}
          {tab === 'prices' && <PriceManagementTab apiConnected={apiConnected} onError={setError} />}
        </div>
      </main>
      
      {modal === 'editor' && estimate && (
        <EstimateEditorModal key={estimate._key} initialData={estimate} apiConnected={apiConnected} companyInfo={companyInfo}
          onClose={() => setModal(null)} onSaved={() => setTab('history')} onError={setError} onAddRooms={handleAddRooms} />
      )}
      {modal === 'company' && <CompanyModal companyInfo={companyInfo} photoSettings={photoSettings} onSave={async (company, photo) => { setCompanyInfo(company); setPhotoSettings(photo); const detected = regionFromAddress(company.address); if (detected) setDefaultRegion(detected); try { await Promise.all([api.settings.saveCompany(company), api.settings.savePhoto(photo)]); } catch { /* non-critical */ } }} onClose={() => setModal(null)} />}
    </div>
  );
}
