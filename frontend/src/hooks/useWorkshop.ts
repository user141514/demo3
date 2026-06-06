import { useState, useEffect, useCallback } from "react";
import { workshopApi } from "@/services/api";
import {
  clearLastMemberWorkshop,
  loadLastMemberWorkshop,
  participantToSessionParticipant,
  saveLastMemberWorkshop,
} from "@/lib/memberSession";
import type { WorkshopMemberView, ParticipantWithToken } from "@/types";

export function useWorkshop(workshopId: number | null) {
  const [workshop, setWorkshop] = useState<WorkshopMemberView | null>(null);
  const [participant, setParticipant] = useState<ParticipantWithToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkshop = useCallback(async (options?: { silent?: boolean }) => {
    if (!workshopId) return;
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      let savedParticipant: ParticipantWithToken | null = null;
      const saved = sessionStorage.getItem("participant");
      if (saved) {
        try {
          savedParticipant = JSON.parse(saved);
          if (savedParticipant?.workshop_id === workshopId) {
            setParticipant(savedParticipant);
          }
        } catch { /* ignore */ }
      }
      if (!savedParticipant || savedParticipant.workshop_id !== workshopId) {
        const lastMember = loadLastMemberWorkshop();
        if (lastMember?.workshop_id === workshopId) {
          savedParticipant = participantToSessionParticipant(lastMember);
          setParticipant(savedParticipant);
          sessionStorage.setItem("participant", JSON.stringify(savedParticipant));
        }
      }
      const data = await workshopApi.get(
        workshopId,
        savedParticipant?.workshop_id === workshopId ? savedParticipant.id : undefined,
        savedParticipant?.workshop_id === workshopId ? savedParticipant.session_token : undefined,
      );
      setWorkshop(data);
      if (data.status === "completed") {
        sessionStorage.removeItem("participant");
        clearLastMemberWorkshop({ workshop_id: workshopId });
        setParticipant(null);
        return;
      }
      if (savedParticipant?.workshop_id === workshopId && !data.participant) {
        sessionStorage.removeItem("participant");
        clearLastMemberWorkshop({
          workshop_id: workshopId,
          participant_id: savedParticipant.id,
          session_token: savedParticipant.session_token,
        });
        setParticipant(null);
        return;
      }
      if (data.participant) {
        setParticipant(data.participant);
        sessionStorage.setItem("participant", JSON.stringify(data.participant));
        saveLastMemberWorkshop(data.invite_code, data.participant);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取工作坊失败");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [workshopId]);

  const joinWorkshop = useCallback(async (name: string, inviteCode: string) => {
    if (!workshopId) return null;
    setLoading(true);
    setError(null);
    try {
      const p = await workshopApi.join(workshopId, name, inviteCode);
      setParticipant(p);
      sessionStorage.setItem("participant", JSON.stringify(p));
      saveLastMemberWorkshop(inviteCode, p);
      return p;
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入工作坊失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    if (workshopId) fetchWorkshop();
  }, [workshopId, fetchWorkshop]);

  useEffect(() => {
    const saved = sessionStorage.getItem("participant");
    if (saved) {
      try { setParticipant(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  return { workshop, participant, loading, error, fetchWorkshop, joinWorkshop, setParticipant };
}
