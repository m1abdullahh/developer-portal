import { describe, expect, it } from 'vitest';
import {
  API_RUNTIMES as RUNTIME_IDS,
  UI_FRAMEWORKS as FRAMEWORK_IDS,
  UI_STATES as STATE_IDS,
  UI_STYLINGS as STYLING_IDS,
  apiOnlyGoSpec,
  apiOnlyGraphqlSpec,
  apiOnlyTrpcSpec,
  spineSpec,
  availableParadigms,
  uiOnlyVercelSpec,
} from '@idp/core';
import {
  API_PARADIGMS,
  API_RUNTIMES,
  DEPLOYMENT_TARGETS,
  ORM_OPTIONS,
  UI_FRAMEWORKS,
  UI_STATES,
  UI_STYLINGS,
} from './labels';
import {
  apiContract,
  formatStageMs,
  helmEnvironments,
  parseTab,
  quickLinks,
  recipeFileCounts,
  serviceHref,
  specSheet,
  stageTimeline,
  type SpecGroup,
} from './service-detail';

function row(group: SpecGroup | undefined, label: string): string | undefined {
  return group?.rows.find((r) => r.label === label)?.value;
}

describe('tabs and addresses', () => {
  it('reads the tab from the URL and falls back to the overview', () => {
    expect(parseTab('stack')).toBe('stack');
    expect(parseTab(['activity', 'stack'])).toBe('activity');
    expect(parseTab(undefined)).toBe('overview');
    expect(parseTab('settings; drop table')).toBe('overview');
  });

  it('addresses a service by organisation and ID, and leaves the default tab out', () => {
    expect(serviceHref('acme', 'shop-web')).toBe('/catalog/acme/shop-web');
    expect(serviceHref('acme', 'shop-web', 'deployments')).toBe(
      '/catalog/acme/shop-web?tab=deployments',
    );
    expect(serviceHref('acme corp', 'a/b')).toBe('/catalog/acme%20corp/a%2Fb');
  });
});

describe('the spec sheet', () => {
  it('groups every decision by the wizard step it was made in, in the wizard’s words', () => {
    const spec = spineSpec();
    const [project, ui, api, ops] = specSheet(spec);

    expect([project?.step, ui?.step, api?.step, ops?.step]).toEqual([1, 2, 3, 4]);
    expect(row(project, 'Technical ID')).toBe(spec.meta.slug);
    expect(row(project, 'Deployment target')).toBe(
      DEPLOYMENT_TARGETS[spec.meta.deploymentTarget].label,
    );
    expect(row(ui, 'Framework')).toBe(UI_FRAMEWORKS['nextjs-app'].label);
    expect(row(api, 'Runtime')).toBe(API_RUNTIMES['node-ts'].label);
    expect(row(api, 'Redis cache')).toBe('Yes');
    expect(row(api, 'Middleware')).toContain('Rate limiting');
    expect(row(ops, 'Kubernetes')).toBe('Yes');
    expect(row(ops, 'Autoscaling')).toMatch(/^\d+–\d+ replicas at \d+% CPU$/);
    expect(row(ops, 'Pipeline stages')).toContain('→');
  });

  it('says a layer was left out rather than showing an empty group', () => {
    const [, ui] = specSheet(apiOnlyGoSpec());
    expect(ui).toMatchObject({ rows: [], absent: expect.stringContaining('API-only') });

    const [, , api] = specSheet(uiOnlyVercelSpec());
    expect(api).toMatchObject({ rows: [], absent: expect.stringContaining('frontend-only') });
  });

  it('leaves out rows that would only repeat an absence', () => {
    const noDb = spineSpec({ ui: null, api: { database: 'none', orm: 'none' } });
    const [, , api] = specSheet(noDb);
    expect(row(api, 'Database')).toBeDefined();
    expect(row(api, 'ORM / data access')).toBeUndefined();

    // No cluster: the Kubernetes row says so, and its dependants do not appear.
    const [, , , ops] = specSheet(uiOnlyVercelSpec());
    expect(row(ops, 'Kubernetes')).toBe('No');
    expect(row(ops, 'Namespace')).toBeUndefined();
    expect(row(ops, 'Autoscaling')).toBeUndefined();
  });

  it('shows fewer rows for a spec it only half understands, and never throws', () => {
    const legacy = {
      meta: { slug: 'old-svc', deploymentTarget: 'heroku' },
      api: { runtime: 'express' },
    };
    const [project, ui, api] = specSheet(legacy);
    expect(row(project, 'Technical ID')).toBe('old-svc');
    expect(row(project, 'Deployment target')).toBe('heroku'); // unknown values pass through
    expect(ui?.absent).toBeDefined();
    expect(row(api, 'Runtime')).toBe('express');

    for (const junk of [null, undefined, 'spec', 7, [], { meta: [] }]) {
      expect(() => specSheet(junk)).not.toThrow();
      expect(specSheet(junk)).toHaveLength(4);
    }
  });
});

describe('the spec sheet, for every stack', () => {
  // Doc 07 §7: "renders the full spec accurately for every stack combination". The sheet reads
  // the spec defensively, so the risk is not a crash — it is a row that silently shows the wrong
  // thing, or nothing, for a combination nobody looked at.
  const ORMS: Record<string, string[]> = {
    'node-ts': ['prisma', 'drizzle', 'none'],
    'python-fastapi': ['sqlmodel', 'sqlalchemy', 'none'],
    'go-gin': ['gorm', 'none'],
  };

  it('names the runtime, paradigm and data layer of every API combination', () => {
    let combinations = 0;
    for (const runtime of RUNTIME_IDS) {
      for (const paradigm of availableParadigms(runtime)) {
        for (const orm of ORMS[runtime] ?? []) {
          const api = { runtime, paradigm, orm, database: orm === 'none' ? 'none' : 'postgres' };
          const [, , group] = specSheet({ api });
          expect(row(group, 'Runtime')).toBe(API_RUNTIMES[runtime].label);
          expect(row(group, 'Paradigm')).toBe(API_PARADIGMS[paradigm].label);
          expect(row(group, 'ORM / data access')).toBe(
            orm === 'none' ? undefined : ORM_OPTIONS[orm as keyof typeof ORM_OPTIONS].label,
          );
          combinations += 1;
        }
      }
    }
    expect(combinations).toBe(19);
  });

  it('names the framework, styling and state of every UI combination', () => {
    for (const framework of FRAMEWORK_IDS) {
      for (const styling of STYLING_IDS) {
        for (const state of STATE_IDS) {
          const [, group] = specSheet({ ui: { framework, styling, state, modules: {} } });
          expect(row(group, 'Framework')).toBe(UI_FRAMEWORKS[framework].label);
          expect(row(group, 'Styling')).toBe(UI_STYLINGS[styling].label);
          expect(row(group, 'State management')).toBe(UI_STATES[state].label);
          expect(row(group, 'Page modules')).toBe('None');
        }
      }
    }
  });
});

describe('the API contract', () => {
  it('states the paths each paradigm answers on, probes included', () => {
    const paths = (spec: unknown) => apiContract(spec)?.endpoints.map((e) => e.path);
    expect(paths(spineSpec())).toEqual(['/openapi.json', '/docs', '/health', '/ready']);
    expect(paths(apiOnlyGraphqlSpec())).toEqual([
      '/graphql',
      '/schema.graphql',
      '/health',
      '/ready',
    ]);
    expect(paths(apiOnlyTrpcSpec())).toEqual(['/trpc', '/health', '/ready']);
  });

  it('is absent for a project with no API', () => {
    expect(apiContract(uiOnlyVercelSpec())).toBeNull();
    expect(apiContract({})).toBeNull();
  });
});

describe('quick links', () => {
  const spec = spineSpec();
  const base = { org: 'acme', slug: 'shop-web', spec };

  it('links the repository, its Actions and pull requests for a GitHub repository', () => {
    const links = quickLinks({ ...base, repoUrl: 'https://github.com/acme/shop-web' });
    expect(links.map((l) => l.label)).toEqual(
      expect.arrayContaining(['Repository', 'Actions', 'Pull requests']),
    );
    expect(links.find((l) => l.label === 'Actions')?.href).toBe(
      'https://github.com/acme/shop-web/actions',
    );
  });

  it('links nothing that cannot be reached — a repository written to disk has no Actions tab', () => {
    expect(quickLinks({ ...base, repoUrl: '/tmp/idp-output/shop-web' })).toEqual([]);
    expect(quickLinks({ ...base, repoUrl: 'file:///tmp/shop-web' })).toEqual([]);
  });

  it('links ArgoCD only when the portal knows where it is and the service uses it', () => {
    const repoUrl = 'https://github.com/acme/shop-web';
    const labels = (input: Parameters<typeof quickLinks>[0]) =>
      quickLinks(input).map((l) => l.label);

    expect(labels({ ...base, repoUrl })).not.toContain('ArgoCD');
    expect(labels({ ...base, repoUrl, argocdUrl: 'https://argo.example.com/' })).toContain(
      'ArgoCD',
    );
    expect(
      labels({ ...base, repoUrl, argocdUrl: 'https://argo.example.com', spec: uiOnlyVercelSpec() }),
    ).not.toContain('ArgoCD');
    expect(labels({ ...base, repoUrl, argocdUrl: 'javascript:alert(1)' })).not.toContain('ArgoCD');
  });
});

describe('generated output', () => {
  it('counts files per recipe, largest first', () => {
    const files = ['a', 'b', 'a', 'c', 'a', 'b'].map((producedBy) => ({ producedBy }));
    expect(recipeFileCounts(files)).toEqual([
      { recipeId: 'a', files: 3 },
      { recipeId: 'b', files: 2 },
      { recipeId: 'c', files: 1 },
    ]);
  });

  it('finds the chart’s values files, base first, then in promotion order', () => {
    const file = (path: string) => ({ path, content: `# ${path}` });
    const environments = helmEnvironments([
      file('deploy/values-prod.yaml'),
      file('deploy/values.yaml'),
      file('README.md'),
      file('deploy/values-staging.yaml'),
      file('deploy/values-dev.yaml'),
      file('deploy/values-qa.yaml'),
      file('deploy/templates/deployment.yaml'),
      { path: 'deploy/values-bin.yaml', content: new Uint8Array([1]) },
    ]);
    expect(environments.map((e) => e.name)).toEqual(['base', 'dev', 'staging', 'prod', 'qa']);
  });
});

describe('provisioning timelines', () => {
  it('collapses the event log into one row per stage, with its share of the time', () => {
    const { stages, totalMs } = stageTimeline([
      { stage: 'resolving', status: 'start' },
      { stage: 'resolving', status: 'done', ms: 1_000 },
      { stage: 'generating', status: 'start' },
      { stage: 'generating', status: 'done', ms: 3_000 },
    ]);
    expect(totalMs).toBe(4_000);
    expect(stages).toEqual([
      { stage: 'resolving', outcome: 'done', ms: 1_000, share: 0.25, message: null },
      { stage: 'generating', outcome: 'done', ms: 3_000, share: 0.75, message: null },
    ]);
  });

  it('shows a failure with its message, and a stage that never finished as unfinished', () => {
    const { stages } = stageTimeline([
      { stage: 'pushing', status: 'start' },
      { stage: 'pushing', status: 'fail', ms: 800, message: 'Repository already exists.' },
      { stage: 'configuring', status: 'start' },
    ]);
    expect(stages[0]).toMatchObject({ outcome: 'failed', message: 'Repository already exists.' });
    expect(stages[1]).toMatchObject({ outcome: 'unfinished', ms: null, share: 0 });
  });

  it('handles a job that recorded nothing', () => {
    expect(stageTimeline([])).toEqual({ stages: [], totalMs: 0 });
  });

  it('formats a stage timing at the precision it was measured in', () => {
    expect(formatStageMs(840)).toBe('840 ms');
    expect(formatStageMs(3_240)).toBe('3.2 s');
    expect(formatStageMs(125_000)).toBe('2 min 05 s');
  });
});
