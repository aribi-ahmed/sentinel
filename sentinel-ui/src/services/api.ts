// src/services/api.ts

const API_URL = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export interface InvestigationData {
  id: string;
  subject_name: string;
  ticker?: string;
  status: string;
  risk_level?: string;
  confidence?: number;  // Certainty level 0-1
  human_approved?: boolean | null;
  supervisor_reasoning?: string;
  final_report?: string;
  research_data?: any[];
  financial_data?: Record<string, any>;
  news_data?: any[];
  compliance_data?: string[];
  logs?: string[];
  created_at?: string;
}

export interface AuditRecord {
  "Database ID": string;
  "Created At": string;
  Company: string;
  Ticker: string;
  Status: string;
  "Risk Level": string;
  Approved: string;
}

export interface FileMetadata {
  name: string;
  type: 'dataset' | 'doc';
  size: number;
  ext: string;
  path: string;
}

export async function startInvestigation(subjectName: string, ticker: string): Promise<InvestigationData> {
  const res = await fetch(`${API_URL}/investigations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject_name: subjectName, ticker }),
  });
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return res.json();
}

export async function approveInvestigation(id: string, approved: boolean): Promise<InvestigationData> {
  const res = await fetch(`${API_URL}/investigations/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approved }),
  });
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return res.json();
}

export async function fetchAuditHistory(): Promise<AuditRecord[]> {
  const res = await fetch(`${API_URL}/investigations`);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return res.json();
}

export async function fetchAssetFiles(): Promise<FileMetadata[]> {
  const res = await fetch(`${API_URL}/assets/files`);
  if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
  return res.json();
}