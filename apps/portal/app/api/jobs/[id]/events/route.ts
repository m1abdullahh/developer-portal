/**
 * Server-Sent Events for one provisioning job.
 *
 * SSE rather than WebSockets: this is one-directional, it survives proxies that mangle upgrade
 * headers, and the browser reconnects on its own. The queue already replays event history to a
 * late subscriber, which is what makes reconnection work — a client that drops mid-provision and
 * comes back gets the stages it missed rather than an empty progress list (doc 06 §3).
 */

import { isTerminal, type JobEvent } from '@idp/queue';
import { authErrorResponse, requireUser } from '../../../../../lib/session';
import { getQueue, syncJob } from '../../../../../lib/provisioning';

export const dynamic = 'force-dynamic';

/**
 * Reads the resume point from the request.
 *
 * The browser sends `Last-Event-ID` automatically on an EventSource reconnect, carrying the `id:`
 * of the last event it received. The query parameter is the manual equivalent, for clients that
 * are not an EventSource. Anything unparseable means "start from the beginning" — replaying too
 * much is recoverable, skipping events is not.
 */
function resumeFrom(request: Request): number | undefined {
  const header = request.headers.get('last-event-id');
  const query = new URL(request.url).searchParams.get('lastEventId');
  const raw = header ?? query;
  if (raw === null) return undefined;

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    await requireUser();
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const after = resumeFrom(request);
  const queue = getQueue();

  const record = await queue.get(id);
  if (!record) return Response.json({ error: 'No such job.' }, { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      /**
       * Teardown steps, collected as they are set up.
       *
       * `finish()` has to be callable before the subscription and heartbeat exist — a job that
       * was already complete when the request arrived closes the stream synchronously, which is
       * the ordinary case of reloading a finished job page. Referring to those bindings directly
       * would put them in a temporal dead zone and throw inside the stream instead of closing it.
       */
      const cleanups: Array<() => void> = [];

      /**
       * Writes one SSE frame.
       *
       * The `id:` line is what makes reconnection cheap: the browser echoes the last one back as
       * `Last-Event-ID`, and the queue then replays only what came after it. Without it, every
       * reconnect re-sends the whole history and the progress list shows each stage twice.
       */
      const send = (
        event: JobEvent | { type: 'snapshot'; record: unknown },
        sequence?: number,
      ): void => {
        if (closed) return;
        try {
          const id = sequence === undefined ? '' : `id: ${sequence}\n`;
          controller.enqueue(encoder.encode(`${id}data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const finish = (): void => {
        if (closed) return;
        closed = true;
        for (const cleanup of cleanups) cleanup();
        try {
          controller.close();
        } catch {
          // Already closed by the client disconnecting.
        }
      };

      // The current state first, so the page renders complete rather than accumulating from
      // whatever happens to arrive next. Skipped on a resume: the client already has it, and a
      // second snapshot would reset a progress list it has been building.
      if (after === undefined) send({ type: 'snapshot', record });

      cleanups.push(
        queue.subscribe(
          id,
          (event, sequence) => {
            send(event, sequence);
            if (event.type === 'done' || event.type === 'error') {
              void queue.get(id).then((final) => {
                if (final) void syncJob(final);
                finish();
              });
            }
          },
          { after },
        ),
      );

      // A job that was already finished before this request arrived gets its replay from
      // subscribe() and then nothing further — so close rather than hold the connection open.
      if (isTerminal(record.status)) {
        finish();
        return;
      }

      // Comment frames keep proxies from timing out an idle connection. `npm install` inside a
      // generated project can produce a long gap between stages.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          finish();
        }
      }, 15_000);
      cleanups.push(() => clearInterval(heartbeat));
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nginx buffers proxied responses by default, which holds every event until the stream
      // ends — turning live progress into a single burst at completion.
      'x-accel-buffering': 'no',
    },
  });
}
