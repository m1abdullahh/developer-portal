---
to: app/api/health/route.ts
---
import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * The path is contractual: the generated Kubernetes deployment points its livenessProbe here
 * (doc 04 section 2). Renaming it without updating the chart causes rolling restarts that look
 * like an application crash.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: '<%= spec.meta.slug %>' });
}
