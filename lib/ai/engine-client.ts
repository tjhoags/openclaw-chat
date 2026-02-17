// OpenClaw engine HTTP client
// Talks to the OpenClaw gateway's engine endpoints

const ENGINE_URL = process.env.OPENCLAW_ENGINE_URL;
const API_KEY = process.env.OPENCLAW_API_KEY;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }
  return headers;
}

export async function submitGoal(
  message: string,
): Promise<{ goalId: string }> {
  if (!ENGINE_URL) {
    throw new Error("OPENCLAW_ENGINE_URL is not configured");
  }

  const res = await fetch(`${ENGINE_URL}/api/engine/chat`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Engine chat failed (${res.status}): ${text || res.statusText}`,
    );
  }

  const data = (await res.json()) as { goalId: string; status: string };
  return { goalId: data.goalId };
}

export interface EngineSSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export function streamGoalEvents(
  goalId: string,
): ReadableStream<EngineSSEEvent> {
  if (!ENGINE_URL) {
    throw new Error("OPENCLAW_ENGINE_URL is not configured");
  }

  return new ReadableStream<EngineSSEEvent>({
    async start(controller) {
      const url = `${ENGINE_URL}/api/engine/chat/stream?goalId=${encodeURIComponent(goalId)}`;

      let res: Response;
      try {
        res = await fetch(url, {
          headers: {
            ...getHeaders(),
            Accept: "text/event-stream",
          },
        });
      } catch (err) {
        controller.error(
          new Error(
            `Failed to connect to engine stream: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        controller.error(
          new Error(
            `Engine stream failed (${res.status}): ${text || res.statusText}`,
          ),
        );
        return;
      }

      if (!res.body) {
        controller.error(new Error("Engine stream returned no body"));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE frames: "event: <type>\ndata: <json>\n\n"
          const frames = buffer.split("\n\n");
          // Keep the last (possibly incomplete) frame in the buffer
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!frame.trim()) continue;

            let eventType = "message";
            let eventData = "{}";

            for (const line of frame.split("\n")) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            // Skip heartbeats and connection events
            if (eventType === "heartbeat" || eventType === "connected") {
              continue;
            }

            try {
              const parsed = JSON.parse(eventData) as Record<string, unknown>;
              controller.enqueue({ event: eventType, data: parsed });
            } catch {
              // Skip malformed JSON frames
            }

            // Close on terminal events
            if (eventType === "done") {
              controller.close();
              return;
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
}
