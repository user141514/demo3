import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Dynamic import so the module sees the mocked fetch
async function getApi() {
  const mod = await import("@/services/api");
  return mod.api;
}

beforeEach(() => {
  mockFetch.mockReset();
});

function mockResponse(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

describe("api service", () => {
  const BASE = "http://localhost:8000/api";

  it("createWorkshop sends POST with title", async () => {
    mockResponse({ id: 1, title: "Test" });
    const api = await getApi();
    await api.createWorkshop("Test");
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/workshops`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Test" }) })
    );
  });

  it("getWorkshop calls GET with id", async () => {
    mockResponse({ id: 5, title: "W" });
    const api = await getApi();
    await api.getWorkshop(5);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/workshops/5`, expect.any(Object));
  });

  it("joinWorkshop sends POST with name and role", async () => {
    mockResponse({ id: 1, workshop_id: 1, name: "Bob", role: "senior" });
    const api = await getApi();
    await api.joinWorkshop(1, "Bob", "senior");
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe(`${BASE}/workshops/1/join`);
    expect(JSON.parse(call[1]?.body || "")).toEqual({ name: "Bob", role: "senior" });
  });

  it("getQuestions fetches by round id", async () => {
    mockResponse([{ id: 1, round_id: 10, content: "Q1", order: 1 }]);
    const api = await getApi();
    const qs = await api.getQuestions(10);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/rounds/10/questions`, expect.any(Object));
    expect(qs).toHaveLength(1);
  });

  it("submitAnswer posts answer data", async () => {
    mockResponse({ id: 99, content: "A" }, 201);
    const api = await getApi();
    await api.submitAnswer(3, { question_id: 7, participant_id: 2, content: "Answer text" });
    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe(`${BASE}/rounds/3/answers`);
    const body = JSON.parse(call[1]?.body || "");
    expect(body).toEqual({ question_id: 7, participant_id: 2, content: "Answer text" });
  });

  it("getAnswers fetches by round id", async () => {
    mockResponse([]);
    const api = await getApi();
    await api.getAnswers(3);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/rounds/3/answers`, expect.any(Object));
  });

  it("summarize sends POST to round", async () => {
    mockResponse({ id: 1, round_id: 3, content: "Summary" });
    const api = await getApi();
    await api.summarize(3);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/rounds/3/summarize`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("getSummary fetches by round id", async () => {
    mockResponse({ id: 1, round_id: 3, content: "S" });
    const api = await getApi();
    await api.getSummary(3);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE}/rounds/3/summary`, expect.any(Object));
  });

  it("nextRound posts to workshop", async () => {
    mockResponse({ current_round: 2 });
    const api = await getApi();
    await api.nextRound(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE}/workshops/1/next-round`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws on non-ok response", async () => {
    mockResponse({ detail: "Not found" }, 404);
    const api = await getApi();
    await expect(api.getWorkshop(999)).rejects.toThrow("API error 404");
  });
});
