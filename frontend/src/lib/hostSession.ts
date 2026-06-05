export const LAST_HOST_WORKSHOP_KEY = "last_host_workshop";

export interface LastHostWorkshop {
  workshop_id: number;
  host_code: string;
  title: string;
  saved_at: string;
}

export function loadLastHostWorkshop(): LastHostWorkshop | null {
  const raw = localStorage.getItem(LAST_HOST_WORKSHOP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LastHostWorkshop>;
    if (
      typeof parsed.workshop_id === "number" &&
      typeof parsed.host_code === "string" &&
      parsed.host_code &&
      typeof parsed.title === "string"
    ) {
      return {
        workshop_id: parsed.workshop_id,
        host_code: parsed.host_code,
        title: parsed.title,
        saved_at: typeof parsed.saved_at === "string" ? parsed.saved_at : new Date().toISOString(),
      };
    }
  } catch {
    // Invalid records are cleaned below.
  }
  localStorage.removeItem(LAST_HOST_WORKSHOP_KEY);
  return null;
}

export function saveLastHostWorkshop(record: Omit<LastHostWorkshop, "saved_at">) {
  localStorage.setItem(
    LAST_HOST_WORKSHOP_KEY,
    JSON.stringify({ ...record, saved_at: new Date().toISOString() }),
  );
}

export function clearLastHostWorkshop(expected?: { workshop_id?: number; host_code?: string }) {
  const current = loadLastHostWorkshop();
  if (!current) return;
  if (
    expected?.workshop_id !== undefined &&
    current.workshop_id !== expected.workshop_id
  ) return;
  if (
    expected?.host_code !== undefined &&
    current.host_code !== expected.host_code
  ) return;
  localStorage.removeItem(LAST_HOST_WORKSHOP_KEY);
}
