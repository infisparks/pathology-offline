import Dexie, { Table } from 'dexie';

// --- Interface Definitions (Matching PatientEntry/Dashboard expectations) ---

export interface UserRow {
  id?: number // Primary key, auto-incremented
  created_at: string
  uid: string // Used for 'login' check, essentially the 'user ID'
  email: string // Added for 'login' simulation
  passwordHash: string // Added for 'login' simulation (in a real app, hash this!)
  name: string
  role: string // e.g., 'admin', 'user'
}

// Ensure these interfaces match what you are inserting in PatientEntry
export interface BloodTestRow {
  id?: number
  created_at: string
  outsource: boolean
  parameter: any
  price: number
  test_name: string
  sub_head: any
}

export interface DoctorRow {
  id?: number
  created_at: string
  commission: number
  doctor_name: string
  number: number
}

export interface PackageRow {
  id?: number
  created_at: string
  discount: number
  package_name: string
  tests: any
}

export interface PatientDetailRow {
  id?: number
  created_at: string
  name: string
  number: number
  address?: string
  age: number
  day_type: string
  gender: string
  patient_id: string
  total_day?: number
  title?: string
}

export interface PaymentHistory {
  totalAmount: number
  discount: number
  paymentHistory: { amount: number; paymentMode: string; time: string }[]
}

export interface RegistrationRow {
  day_type: "year" | "month" | "day";
  bloodtest_detail: {};
  id?: number
  created_at: string
  patient_id: number
  amount_paid: number
  visit_type: string
  registration_time: string // Indexed for Dashboard queries
  sample_collection_time?: string
  discount: number
  hospital_name: string
  payment_mode: string
  blood_tests: any // Array of test objects
  amount_remaining: number
  doctor_name: string
  tpa: boolean
  ipd_id?: number | null
  amount_paid_history: PaymentHistory
  bill_no?: string
  // Note: Deleted records would typically go in a separate table
}


// --- Dexie Database Class ---
export class LocalDexie extends Dexie {
  // Define your tables
  user!: Table<UserRow>;
  blood_test!: Table<BloodTestRow>;
  doctorlist!: Table<DoctorRow>;
  packages!: Table<PackageRow>; 
  patientdetail!: Table<PatientDetailRow>;
  registration!: Table<RegistrationRow>; // Main data table

  constructor() {
    super('OfflineLabAppDatabase');
    
    // VERSION 2: Added 'registration_time' index to 'registration' table
    this.version(2).stores({
      user: '++id, uid, email', 
      blood_test: '++id, test_name',
      doctorlist: '++id, doctor_name',
      packages: '++id, package_name',
      patientdetail: '++id, patient_id, number, name', 
      // FIX APPLIED HERE: Added registration_time to the index
      registration: '++id, patient_id, registration_time', 
    });

    // Handle migration logic if going from v1 to v2 is ever needed
    this.version(1).stores({
      user: '++id, uid, email', 
      blood_test: '++id, test_name',
      doctorlist: '++id, doctor_name',
      packages: '++id, package_name',
      patientdetail: '++id, patient_id, number, name', 
      registration: '++id, patient_id', // Old schema for backward compatibility check
    }).upgrade(tx => {
       // Dexie will automatically recreate the index in v2; no data loss expected.
       // For a non-breaking change like adding an index, no complex upgrade logic is needed.
    });
  }
}

export const db = new LocalDexie();

// Example initialization (run once)
db.on('ready', async () => {
  if ((await db.user.count()) === 0) {
    // Insert a default admin user if the database is empty
    await db.user.add({
      created_at: new Date().toISOString(),
      uid: 'offline-admin-123', 
      email: 'admin@offline.app',
      passwordHash: 'password123', 
      name: 'Offline Admin',
      role: 'admin',
    });
    console.log("Default admin user created.");
  }
});
