// Bridge: OpenClaw engine SSE events → Vercel AI SDK UIMessageStream chunks
// Converts LoopEvent types into UIMessageStreamWriter.write() calls

import { streamGoalEvents, type EngineSSEEvent } from "./engine-client";
import { generateUUID } from "../utils";

interface UIMessageStreamWriter {
  write(part: Record<string, unknown>): void;
}

/**
 * Reads engine SSE events for a goal and writes them as UIMessageStream
 * chunks to the provided writer. Returns when the goal completes or errors.
 */
export async function createEngineStream(
  goalId: string,
  writer: UIMessageStreamWriter,
): Promise<void> {
  const eventStream = streamGoalEvents(goalId);
  const reader = eventStream.getReader();

  // Track the current text part ID so we can batch deltas into one text part
  let activeTextId: string | null = null;

  function ensureTextStarted(): string {
    if (!activeTextId) {
      activeTextId = generateUUID();
      writer.write({ type: "text-start", id: activeTextId });
    }
    return activeTextId;
  }

  function finishText(): void {
    if (activeTextId) {
      writer.write({ type: "text-end", id: activeTextId });
      activeTextId = null;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      handleEvent(value, writer, ensureTextStarted, finishText);
    }
  } finally {
    reader.releaseLock();
    // Ensure we always close any open text part
    finishText();
  }
}

function handleEvent(
  event: EngineSSEEvent,
  writer: UIMessageStreamWriter,
  ensureTextStarted: () => string,
  finishText: () => void,
): void {
  const { event: type, data } = event;

  switch (type) {
    // ─── Agent thinking → reasoning parts ────────────────────────────
    case "agent:thinking": {
      finishText();
      const id = generateUUID();
      const agentId = (data.agentId as string) ?? "agent";
      const content =
        (data.text as string) ??
        (data.content as string) ??
        `${agentId} is thinking...`;
      writer.write({ type: "reasoning-start", id });
      writer.write({ type: "reasoning-delta", id, delta: content });
      writer.write({ type: "reasoning-end", id });
      break;
    }

    // ─── Agent response → text parts ─────────────────────────────────
    case "agent:response": {
      const content =
        (data.output as string) ??
        (data.text as string) ??
        (data.content as string) ??
        "";
      if (content) {
        const id = ensureTextStarted();
        writer.write({
          type: "text-delta",
          id,
          delta: `${content}\n\n`,
        });
      }
      break;
    }

    // ─── Task lifecycle → data annotations ───────────────────────────
    case "task:created": {
      const task = data.task as Record<string, unknown> | undefined;
      const title =
        (task?.title as string) ??
        (data.description as string) ??
        (task?.id as string) ??
        "";
      writer.write({
        type: "data-appendMessage" as string,
        data: `Task created: ${title}`,
      });
      break;
    }

    case "task:started": {
      const agentId = (data.agentId as string) ?? "";
      const taskId = (data.taskId as string) ?? "";
      writer.write({
        type: "data-appendMessage" as string,
        data: `Task ${taskId} assigned to agent`,
      });
      break;
    }

    case "task:completed": {
      // task:completed has nested structure: { task: { id, title, result }, result: { output } }
      const task = data.task as Record<string, unknown> | undefined;
      const title = (task?.title as string) ?? (task?.id as string) ?? "";
      writer.write({
        type: "data-appendMessage" as string,
        data: `Task completed: ${title}`,
      });
      break;
    }

    case "task:failed": {
      const error = (data.error as string) ?? "unknown error";
      writer.write({
        type: "data-appendMessage" as string,
        data: `Task failed: ${error}`,
      });
      break;
    }

    // ─── Goal completed → finish ─────────────────────────────────────
    case "goal:completed": {
      const tasks = (data.tasks as number) ?? 0;
      const completed = (data.completed as number) ?? 0;
      const failed = (data.failed as number) ?? 0;

      // Write a summary line
      const id = ensureTextStarted();
      writer.write({
        type: "text-delta",
        id,
        delta: `\n\n---\nGoal completed (${completed}/${tasks} tasks, ${failed} failed)\n`,
      });
      finishText();

      writer.write({ type: "finish", finishReason: "stop" });
      break;
    }

    // ─── Errors ──────────────────────────────────────────────────────
    case "agent:error":
    case "loop:error": {
      finishText();
      const errorText =
        (data.error as string) ?? (data.message as string) ?? "Engine error";
      writer.write({ type: "error", errorText });
      break;
    }

    // ─── Loop lifecycle (informational) ──────────────────────────────
    case "loop:started":
    case "loop:tick":
    case "loop:stopped":
    case "task:assigned":
    case "goal:created":
      // These are internal lifecycle events — skip silently
      break;

    default:
      // Unknown event types are silently ignored
      break;
  }
}
