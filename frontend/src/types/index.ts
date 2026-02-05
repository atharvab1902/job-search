export interface Job {
  id: number;
  title: string;
  company_name: string;
  company_id: number | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_type: 'hourly' | 'annual' | null;
  remote_type: 'remote' | 'hybrid' | 'onsite' | null;
  source: 'indeed' | 'linkedin' | 'glassdoor' | 'manual';
  source_url: string | null;
  description: string | null;
  requirements: string | null;
  status: JobStatus;
  priority: number;
  fit_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  h1b_sponsor: number | null;
  h1b_petitions: number | null;
}

export type JobStatus = 'new' | 'interested' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';

export interface Reminder {
  id: number;
  job_id: number;
  type: 'follow_up' | 'interview_prep' | 'thank_you' | 'custom';
  due_date: string;
  message: string | null;
  completed: number;
  completed_at: string | null;
  job_title?: string;
  company_name?: string;
}

export interface Stats {
  total: number;
  h1bSponsors: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  reminders: {
    upcoming: number;
    overdue: number;
  };
  recentJobs: number;
  funnel: {
    applied: number;
    interviewing: number;
    offers: number;
    rejected: number;
    responseRate: number;
  };
}

export interface H1BResult {
  company: string;
  sponsors: boolean | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  petitions: number;
  source: string;
  note?: string;
}
