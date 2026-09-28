import type { CreateLeadInput, ExtractionResult, Lead, Message } from "./types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function sendJson<T>(url: string, method: string, data?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listMessages: () => getJson<Message[]>("/api/messages"),
  getMessage: (messageId: string) => getJson<Message>(`/api/messages/${encodeURIComponent(messageId)}`),
  listLeads: () => getJson<Lead[]>("/api/leads"),
  extractLead: (messageId: string) =>
    sendJson<ExtractionResult>("/api/ai/extract", "POST", { messageId }),
  createLead: (lead: CreateLeadInput) =>
    sendJson<Lead>("/api/leads", "POST", lead),
  updateLeadStatus: (leadId: string, status: "CONTACTED") =>
    sendJson<Lead>(`/api/leads/${encodeURIComponent(leadId)}/status`, "PATCH", { status }),
};
