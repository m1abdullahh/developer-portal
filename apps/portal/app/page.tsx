/**
 * P0 placeholder. The wizard, catalog and job views land in P1.5 / P4.
 *
 * Renders live counts from @idp/core so the P0 gate proves the workspace wiring actually
 * resolves at build time, not just at typecheck time.
 */

import { API_RUNTIMES, UI_FRAMEWORKS, CURRENT_SPEC_VERSION } from '@idp/core';

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Internal Developer Portal</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>
        Phase 0 scaffold — spec version {CURRENT_SPEC_VERSION}.
      </p>
      <p>
        {UI_FRAMEWORKS.length} UI frameworks and {API_RUNTIMES.length} back-end runtimes are
        registered in the spec contract. The provisioning wizard arrives in Phase 1.
      </p>
    </main>
  );
}
