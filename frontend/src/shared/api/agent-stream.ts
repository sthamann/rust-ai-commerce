/** Decode bounded UTF-8 SSE chat frames; only a completed native result reaches the existing Studio state owner. */
export async function readAgentStream(response: Response): Promise<any> {
  if (!response.body) throw new Error("Agent stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) bytes += value.byteLength;
      if (bytes > 4 * 1024 * 1024)
        throw new Error("Agent response exceeds limit");
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(
        /\r\n/g,
        "\n",
      );
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const lines = frame.split("\n");
        const event = lines
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const parsed = JSON.parse(data);
        if (event === "complete" || event === "error") return parsed;
        if (event === "waiting" && Number.isFinite(parsed.elapsedSeconds))
          window.dispatchEvent(
            new CustomEvent("vendune-agent-progress", { detail: parsed }),
          );
      }
      if (buffer.length > 4 * 1024 * 1024)
        throw new Error("Agent frame exceeds limit");
      if (done) throw new Error("Agent stream ended before completion");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
