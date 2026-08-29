import { corsHeaders } from "./http.ts";

const encoder = new TextEncoder();

export function encodeSse(event: string, data: unknown, id?: string): Uint8Array {
  const lines = [
    ...(id ? [`id: ${id}`] : []),
    `event: ${event}`,
    `data: ${JSON.stringify(data)}`,
    "",
    "",
  ];
  return encoder.encode(lines.join("\n"));
}

export function sseResponse(request: Request, stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      ...corsHeaders(request),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function writeSse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  data: unknown,
  sequence: { value: number },
): Promise<void> {
  sequence.value += 1;
  controller.enqueue(encodeSse(event, data, String(sequence.value)));
}
