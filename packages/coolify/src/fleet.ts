import { getEnvironment, listEnvironments, listProjects, listServers } from "./api";
import type { CoolifyHttp } from "./http";
import { mapPool } from "./pool";
import { ok, type Result } from "./result";
import type { FleetEnvironment, FleetProject, FleetServer } from "./types";

const CONCURRENCY = 6;

export type Fleet = {
  servers: FleetServer[];
  projects: FleetProject[];
  /** ISO 8601. Kartların tazelik göstergesi bunu kullanır. */
  loadedAt: string;
  /** Sunucu listesi okunamadıysa dolu gelir; `servers` boş olsa da "sunucu yok" demek değildir. */
  serversFailure?: string;
};

type ProjectWithEnvList = {
  uuid: string;
  name: string;
  envList: Array<{ uuid: string; name: string }> | null;
  envListFailure?: string;
};

type EnvDetailFetch = {
  projectUuid: string;
  projectName: string;
  env: { uuid: string; name: string };
};

type EnvDetailResult = {
  projectUuid: string;
  env: FleetEnvironment;
};

export async function loadFleet(http: CoolifyHttp): Promise<Result<Fleet>> {
  const projectsResult = await listProjects(http);
  if (!projectsResult.ok) return projectsResult;

  // Sunucu listesi ikincildir: düşerse ağaç yine kurulur.
  const serversResult = await listServers(http);
  const servers = serversResult.ok ? serversResult.value : [];

  // Phase 1: Fetch environment lists for all projects (concurrency: 6)
  const projectsWithEnvLists = await mapPool(
    projectsResult.value,
    CONCURRENCY,
    async (project): Promise<ProjectWithEnvList> => {
      const envList = await listEnvironments(http, project.uuid);
      if (!envList.ok) {
        return {
          uuid: project.uuid,
          name: project.name,
          envList: null,
          envListFailure: envList.error.message,
        };
      }
      return {
        uuid: project.uuid,
        name: project.name,
        envList: envList.value,
      };
    },
  );

  // Phase 2: Flatten all (project, environment) pairs
  const envDetailFetches: EnvDetailFetch[] = [];
  for (const project of projectsWithEnvLists) {
    if (project.envList) {
      for (const env of project.envList) {
        envDetailFetches.push({
          projectUuid: project.uuid,
          projectName: project.name,
          env,
        });
      }
    }
  }

  // Phase 3: Fetch all environment details (concurrency: 6)
  const envDetails = await mapPool(envDetailFetches, CONCURRENCY, async (item): Promise<EnvDetailResult> => {
    const detail = await getEnvironment(http, item.projectUuid, item.env.name, item.projectName);
    if (!detail.ok) {
      return {
        projectUuid: item.projectUuid,
        env: {
          uuid: item.env.uuid,
          name: item.env.name,
          resources: [],
          failure: detail.error.message,
        },
      };
    }
    return {
      projectUuid: item.projectUuid,
      env: detail.value,
    };
  });

  // Phase 4: Reassemble the tree in original order
  const envsByProject = new Map<string, FleetEnvironment[]>();
  for (const result of envDetails) {
    if (!envsByProject.has(result.projectUuid)) {
      envsByProject.set(result.projectUuid, []);
    }
    envsByProject.get(result.projectUuid)!.push(result.env);
  }

  const projects: FleetProject[] = projectsWithEnvLists.map((project) => ({
    uuid: project.uuid,
    name: project.name,
    environments: envsByProject.get(project.uuid) ?? [],
    failure: project.envListFailure,
  }));

  return ok({
    servers,
    projects,
    loadedAt: new Date().toISOString(),
    ...(serversResult.ok ? {} : { serversFailure: serversResult.error.message }),
  });
}
