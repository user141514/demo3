import type {
  WorkshopCreateResponse, WorkshopMemberView, WorkshopHostView,
  ParticipantWithToken, Question, Answer, GroupRoundResult,
  SynthesisResult, HostInput, KnowledgeDocument, AIQuestion,
  ValidateResponse, ExportResponse,
} from "@/types";

const BASE_URL = "http://localhost:8000/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    let message = errorText;
    try {
      const parsed = JSON.parse(errorText);
      if (typeof parsed.detail === "string") {
        message = parsed.detail;
      } else if (Array.isArray(parsed.detail)) {
        message = parsed.detail
          .map((item: { msg?: string }) => item.msg ?? JSON.stringify(item))
          .join("; ");
      }
    } catch {
      // Keep raw response text when it is not JSON.
    }
    throw new Error(`API error ${res.status}: ${message}`);
  }
  return res.json() as Promise<T>;
}

// ── Workshop ──────────────────────────────────────────────────────────

export const workshopApi = {
  create: (title: string, host_name: string) =>
    request<WorkshopCreateResponse>("/workshops", {
      method: "POST",
      body: JSON.stringify({ title, host_name }),
    }),

  get: (id: number) =>
    request<WorkshopMemberView>(`/workshops/${id}`),

  getHost: (id: number, code: string) =>
    request<WorkshopHostView>(`/workshops/${id}/host?code=${encodeURIComponent(code)}`),

  validateHost: (host_code: string) =>
    request<ValidateResponse>("/workshops/validate-host", {
      method: "POST",
      body: JSON.stringify({ host_code }),
    }),

  validateInvite: (invite_code: string) =>
    request<ValidateResponse>("/workshops/validate-invite", {
      method: "POST",
      body: JSON.stringify({ invite_code }),
    }),

  join: (id: number, name: string, invite_code: string) =>
    request<ParticipantWithToken>(`/workshops/${id}/join`, {
      method: "POST",
      body: JSON.stringify({ name, invite_code }),
    }),

  unlockRound: (id: number, code: string) =>
    request<WorkshopHostView>(`/workshops/${id}/unlock-round?code=${encodeURIComponent(code)}`, {
      method: "POST",
    }),

  updateRoundSettings: (id: number, code: string, discussion_time?: number, input_time?: number) =>
    request<WorkshopHostView>(`/workshops/${id}/round-settings?code=${encodeURIComponent(code)}`, {
      method: "POST",
      body: JSON.stringify({ discussion_time, input_time }),
    }),

  startTimer: (id: number, code: string) =>
    request<WorkshopHostView>(`/workshops/${id}/timer/start?code=${encodeURIComponent(code)}`, {
      method: "POST",
    }),

  submitHostInput: (id: number, code: string, round_id: number, content: string) =>
    request<HostInput>(`/workshops/${id}/host-input?code=${encodeURIComponent(code)}`, {
      method: "POST",
      body: JSON.stringify({ round_id, content }),
    }),

  editGroupResult: (id: number, resultId: number, code: string, edited_content: string) =>
    request<GroupRoundResult>(`/workshops/${id}/group-results/${resultId}?code=${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify({ edited_content }),
    }),

  editSynthesis: (id: number, roundId: number, code: string, edited_content: string) =>
    request<SynthesisResult>(`/workshops/${id}/synthesis/${roundId}?code=${encodeURIComponent(code)}`, {
      method: "PUT",
      body: JSON.stringify({ edited_content }),
    }),

  export: (id: number, code: string) =>
    request<ExportResponse>(`/workshops/${id}/export?code=${encodeURIComponent(code)}`),
};

// ── Group ─────────────────────────────────────────────────────────────

export const groupApi = {
  getQuestions: (groupId: number, workshopId: number) =>
    request<Question[]>(`/groups/${groupId}/questions?workshop_id=${workshopId}`),

  submitAnswer: (groupId: number, data: { participant_id: number; question_id: number; content: string }) =>
    request<Answer>(`/groups/${groupId}/answers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getAnswers: (groupId: number, workshopId: number) =>
    request<Answer[]>(`/groups/${groupId}/answers?workshop_id=${workshopId}`),

  triggerAI: (groupId: number, workshopId: number) =>
    request<GroupRoundResult>(`/groups/${groupId}/ai-generate?workshop_id=${workshopId}`, {
      method: "POST",
    }),

  getAIResult: (groupId: number, workshopId: number) =>
    request<GroupRoundResult>(`/groups/${groupId}/ai-result?workshop_id=${workshopId}`),

  editAIResult: (
    groupId: number,
    workshopId: number,
    participant_id: number,
    session_token: string,
    edited_content: string,
  ) =>
    request<GroupRoundResult>(`/groups/${groupId}/ai-result?workshop_id=${workshopId}`, {
      method: "PUT",
      body: JSON.stringify({ participant_id, session_token, edited_content }),
    }),

  synthesize: (roundId: number) =>
    request<SynthesisResult>(`/rounds/${roundId}/synthesize`, {
      method: "POST",
    }),

  getSynthesis: (roundId: number) =>
    request<SynthesisResult>(`/rounds/${roundId}/synthesis`),
};

// ── Knowledge Base ────────────────────────────────────────────────────

export const knowledgeApi = {
  validateAdmin: (admin_code: string) =>
    request<ValidateResponse>("/knowledge/validate-admin", {
      method: "POST",
      body: JSON.stringify({ admin_code }),
    }),

  upload: (filename: string, content_base64: string, content_type: string, workshop_id: number, admin_code: string) =>
    request<KnowledgeDocument>("/knowledge/upload", {
      method: "POST",
      body: JSON.stringify({ filename, content_base64, content_type, workshop_id, admin_code }),
    }),

  list: (workshop_id: number, admin_code: string) =>
    request<KnowledgeDocument[]>(`/knowledge/documents?workshop_id=${workshop_id}&admin_code=${encodeURIComponent(admin_code)}`),

  delete: (docId: number, workshop_id: number, admin_code: string) =>
    request<{ status: string }>(`/knowledge/documents/${docId}?workshop_id=${workshop_id}&admin_code=${encodeURIComponent(admin_code)}`, {
      method: "DELETE",
    }),
};

// ── AI QA ─────────────────────────────────────────────────────────────

export const aiApi = {
  ask: (workshopId: number, participant_id: number, question: string) =>
    request<AIQuestion>(`/workshops/${workshopId}/ai-ask`, {
      method: "POST",
      body: JSON.stringify({ participant_id, question }),
    }),

  getHistory: (workshopId: number, participant_id: number) =>
    request<AIQuestion[]>(`/workshops/${workshopId}/ai-questions?participant_id=${participant_id}`),
};
