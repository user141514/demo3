import type { ParticipantWithToken } from "@/types";

export const LAST_MEMBER_WORKSHOP_KEY = "last_member_workshop";

export interface LastMemberWorkshop {
  workshop_id: number;
  invite_code: string;
  participant_id: number;
  session_token: string;
  name: string;
  group_id: number;
  saved_at: string;
}

export function loadLastMemberWorkshop(): LastMemberWorkshop | null {
  const raw = localStorage.getItem(LAST_MEMBER_WORKSHOP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastMemberWorkshop>;
    if (
      typeof parsed.workshop_id === "number" &&
      typeof parsed.participant_id === "number" &&
      typeof parsed.session_token === "string" &&
      parsed.session_token &&
      typeof parsed.name === "string" &&
      typeof parsed.group_id === "number"
    ) {
      return {
        workshop_id: parsed.workshop_id,
        invite_code: typeof parsed.invite_code === "string" ? parsed.invite_code : "",
        participant_id: parsed.participant_id,
        session_token: parsed.session_token,
        name: parsed.name,
        group_id: parsed.group_id,
        saved_at: typeof parsed.saved_at === "string" ? parsed.saved_at : new Date().toISOString(),
      };
    }
  } catch {
    // Invalid records are cleaned below.
  }
  localStorage.removeItem(LAST_MEMBER_WORKSHOP_KEY);
  return null;
}

export function saveLastMemberWorkshop(invite_code: string, participant: ParticipantWithToken) {
  localStorage.setItem(
    LAST_MEMBER_WORKSHOP_KEY,
    JSON.stringify({
      workshop_id: participant.workshop_id,
      invite_code,
      participant_id: participant.id,
      session_token: participant.session_token,
      name: participant.name,
      group_id: participant.group_id,
      saved_at: new Date().toISOString(),
    }),
  );
}

export function clearLastMemberWorkshop(expected?: { workshop_id?: number; participant_id?: number; session_token?: string }) {
  const current = loadLastMemberWorkshop();
  if (!current) return;
  if (expected?.workshop_id !== undefined && current.workshop_id !== expected.workshop_id) return;
  if (expected?.participant_id !== undefined && current.participant_id !== expected.participant_id) return;
  if (expected?.session_token !== undefined && current.session_token !== expected.session_token) return;
  localStorage.removeItem(LAST_MEMBER_WORKSHOP_KEY);
}

export function participantToSessionParticipant(record: LastMemberWorkshop): ParticipantWithToken {
  return {
    id: record.participant_id,
    workshop_id: record.workshop_id,
    name: record.name,
    group_id: record.group_id,
    is_group_leader: false,
    session_token: record.session_token,
  };
}
