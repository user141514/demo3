import { afterEach, describe, expect, it, vi } from "vitest";

import { copyText } from "@/lib/copyText";

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("uses navigator.clipboard in secure contexts", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("navigator", {
      clipboard: { writeText },
    });
    vi.stubGlobal("window", {
      isSecureContext: true,
    });

    await copyText("ABC123");

    expect(writeText).toHaveBeenCalledWith("ABC123");
  });

  it("falls back to execCommand in insecure contexts", async () => {
    const execCommand = vi.fn().mockReturnValue(true);

    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", {
      isSecureContext: false,
    });
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
      writable: true,
    });

    await copyText("HTTP-COPY");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
