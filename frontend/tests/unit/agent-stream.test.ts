/** Regression coverage for fragmented SSE, interrupted results and bounded untrusted frames. */
import { describe, it, expect } from "vitest";
import { readAgentStream } from "../../src/shared/api/agent-stream";
function response(parts: string[]) {
  return new Response(
    new ReadableStream({
      start(controller) {
        parts.forEach((s) => controller.enqueue(new TextEncoder().encode(s)));
        controller.close();
      },
    }),
  );
}
describe("Agent result stream", () => {
  it("reads a completion split across arbitrary network chunks", async () => {
    expect(
      await readAgentStream(
        response([
          "event: accepted\ndata: {}\n\nevent: comp",
          'lete\ndata: {"messages":[{"content":"Grüße"}]}\n\n',
        ]),
      ),
    ).toEqual({ messages: [{ content: "Grüße" }] });
  });
  it("normalizes CRLF boundaries split by the network", async () => {
    expect(
      await readAgentStream(
        response(["event: complete\r", '\ndata: {"ok":true}\r', "\n\r", "\n"]),
      ),
    ).toEqual({ ok: true });
  });
  it("preserves native error status for the existing authentication owner", async () => {
    expect(
      await readAgentStream(
        response(['event: error\ndata: {"errors":[{"status":401}]}\n\n']),
      ),
    ).toEqual({ errors: [{ status: 401 }] });
  });
  it("rejects an interrupted response instead of accepting a partial result", async () => {
    await expect(
      readAgentStream(
        response(['event: waiting\ndata: {"elapsedSeconds":1}\n\n']),
      ),
    ).rejects.toThrow("before completion");
  });
  it("rejects an oversized frame", async () => {
    await expect(
      readAgentStream(response(["x".repeat(4 * 1024 * 1024 + 1)])),
    ).rejects.toThrow("limit");
  });
});
