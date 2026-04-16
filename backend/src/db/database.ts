import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';

export interface Company {
  id: number;
  name: string;
  h1b_sponsor: number | null;
  h1b_petitions: number;
  website: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  company_id: number | null;
  title: string;
  company_name: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: string | null;
  remote_type: string | null;
  source: string;
  source_url: string | null;
  email_id: string | null;
  description: string | null;
  requirements: string | null;
  status: string;
  priority: number;
  fit_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: number;
  job_id: number;
  applied_date: string;
  resume_version: string;
  cover_letter_path: string | null;
  linkedin_message_sent: number;
  referral_contact: string | null;
  referral_linkedin: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: number;
  job_id: number;
  type: string;
  due_date: string;
  message: string | null;
  completed: number;
  completed_at: string | null;
  created_at: string;
}

export interface H1BRecord {
  id: number;
  employer: string;
  job_title: string | null;
  wage: number | null;
  city: string | null;
  state: string | null;
  year: number | null;
}

export interface EmailLog {
  id: number;
  email_id: string;
  subject: string | null;
  from_address: string | null;
  received_date: string | null;
  processed: number;
  jobs_extracted: number;
  created_at: string;
}

export interface Database {
  companies: Company[];
  jobs: Job[];
  applications: Application[];
  reminders: Reminder[];
  h1b_data: H1BRecord[];
  email_log: EmailLog[];
  counters: {
    companies: number;
    jobs: number;
    applications: number;
    reminders: number;
    h1b_data: number;
    email_log: number;
  };
}

const defaultData: Database = {
  companies: [],
  jobs: [],
  applications: [],
  reminders: [],
  h1b_data: [],
  email_log: [],
  counters: {
    companies: 0,
    jobs: 0,
    applications: 0,
    reminders: 0,
    h1b_data: 0,
    email_log: 0
  }
};

const DB_PATH = path.join(__dirname, '../../../data/db.json');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const adapter = new JSONFile<Database>(DB_PATH);
const db = new Low<Database>(adapter, defaultData);

export async function initializeDatabase() {
  await db.read();
  if (!db.data) {
    db.data = defaultData;
  }
  // Ensure all required fields exist
  db.data.companies = db.data.companies || [];
  db.data.jobs = db.data.jobs || [];
  db.data.applications = db.data.applications || [];
  db.data.reminders = db.data.reminders || [];
  db.data.h1b_data = db.data.h1b_data || [];
  db.data.email_log = db.data.email_log || [];
  db.data.counters = db.data.counters || defaultData.counters;
  await db.write();
  console.log('Database initialized at:', DB_PATH);
}

export function getNextId(table: keyof Database['counters']): number {
  db.data!.counters[table]++;
  return db.data!.counters[table];
}

export function now(): string {
  return new Date().toISOString();
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

export default db;
//test