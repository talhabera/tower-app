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
};

export async function loadFleet(http: CoolifyHttp): Promise<Result<Fleet>> {
  const projectsResult = await listProjects(http);
  if (!projectsResult.ok) return projectsResult;

  // Sunucu listesi ikincildir: düşerse ağaç yine kurulur.
  const serversResult = await listServers(http);
  const servers = serversResult.ok ? serversResult.value : [];

  const projects = await mapPool(projectsResult.value, CONCURRENCY, async (project): Promise<FleetProject> => {
    const envList = await listEnvironments(http, project.uuid);
    if (!envList.ok) {
      return { uuid: project.uuid, name: project.name, environments: [], failure: envList.error.message };
    }

    const environments = await mapPool(envList.value, CONCURRENCY, async (env): Promise<FleetEnvironment> => {
      const detail = await getEnvironment(http, project.uuid, env.name, project.name);
      if (!detail.ok) return { uuid: env.uuid, name: env.name, resources: [] };
      return detail.value;
    });

    return { uuid: project.uuid, name: project.name, environments };
  });

  return ok({ servers, projects, loadedAt: new Date().toISOString() });
}
