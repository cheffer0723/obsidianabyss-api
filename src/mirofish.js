/**
 * MiroFish integration client.
 *
 * Talks to a real, unmodified MiroFish deployment (https://github.com/666ghj/MiroFish)
 * over its Flask backend REST API. This is NOT a reimplementation of MiroFish's
 * simulation logic — it is a thin HTTP client against the actual service.
 *
 * Confirmed endpoint contracts (read directly from MiroFish's
 * backend/app/api/graph.py source). All graph routes are registered under the
 * /api/graph blueprint prefix (see backend/app/__init__.py) — NOT at root, which
 * is what caused the first round of "not found" responses against the live deploy:
 *   POST   /api/graph/ontology/generate   multipart: files[] + simulation_requirement + project_name -> { project_id, ontology }
 *   POST   /api/graph/build               { project_id, graph_name?, chunk_size?, chunk_overlap? } -> { task_id }
 *   GET    /api/graph/task/<task_id>                                                      -> { status, progress, ... }
 *   GET    /api/graph/tasks
 *   GET    /api/graph/data/<graph_id>                                                     -> graph nodes/edges
 *   GET    /api/graph/project/<project_id>
 *   GET    /api/graph/project/list
 *   POST   /api/graph/project/<project_id>/reset
 *   DELETE /api/graph/project/<project_id>
 *   DELETE /api/graph/delete/<graph_id>
 *   GET    /health (root, no prefix)
 *
 * Simulation + report endpoints live under /api/simulation and /api/report
 * (simulation_bp / report_bp in the same __init__.py) but their request/response
 * shapes are not yet confirmed against a live instance — runSimulation/getReport
 * below are placeholders to be firmed up once read in full. Do not treat their
 * paths as final.
 */

function baseUrl() {
  const url = process.env.MIROFISH_BASE_URL;
  if (!url) {
    const error = new Error('MiroFish is not configured');
    error.statusCode = 503;
    throw error;
  }
  return url.replace(/\/+$/, '');
}

export function isMiroFishConfigured() {
  return Boolean(process.env.MIROFISH_BASE_URL);
}

const GRAPH_PREFIX = '/api/graph';

/** Hits the root-level /health endpoint (no /api prefix). */
export async function checkHealth() {
  return request('/health');
}

async function request(path, options = {}) {
  const url = `${baseUrl()}${path}`;
  let response;
  try {
    response = await fetch(url, options);
  } catch (networkError) {
    const error = new Error(`MiroFish is unreachable: ${networkError.message}`);
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`MiroFish request failed (${response.status}): ${detail.slice(0, 300)}`);
    error.statusCode = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  return response.json();
}

/**
 * Kick off ontology generation for a new MiroFish project.
 * `files` should be an array of { filename, content, contentType } describing the
 * source documents/strategy context to build the project from.
 */
export async function generateOntology({ projectName, simulationRequirement, files = [] }) {
  if (!simulationRequirement) {
    const error = new Error('simulationRequirement is required');
    error.statusCode = 400;
    throw error;
  }

  const form = new FormData();
  form.set('project_name', projectName || `obsidian-abyss-${Date.now()}`);
  form.set('simulation_requirement', simulationRequirement);
  for (const file of files) {
    const blob = new Blob([file.content], { type: file.contentType || 'text/plain' });
    form.append('files', blob, file.filename || 'context.txt');
  }

  return request(`${GRAPH_PREFIX}/ontology/generate`, { method: 'POST', body: form });
}

/** Start the async knowledge-graph build for a project. Returns { task_id }. */
export async function buildGraph({ projectId, graphName, chunkSize, chunkOverlap }) {
  if (!projectId) {
    const error = new Error('projectId is required');
    error.statusCode = 400;
    throw error;
  }

  return request(`${GRAPH_PREFIX}/build`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      graph_name: graphName,
      chunk_size: chunkSize,
      chunk_overlap: chunkOverlap
    })
  });
}

/** Poll an async task (graph build, simulation run, etc). */
export async function getTaskStatus(taskId) {
  if (!taskId) {
    const error = new Error('taskId is required');
    error.statusCode = 400;
    throw error;
  }
  return request(`${GRAPH_PREFIX}/task/${encodeURIComponent(taskId)}`);
}

/** Fetch the built knowledge graph's nodes/edges. */
export async function getGraphData(graphId) {
  if (!graphId) {
    const error = new Error('graphId is required');
    error.statusCode = 400;
    throw error;
  }
  return request(`${GRAPH_PREFIX}/data/${encodeURIComponent(graphId)}`);
}

export async function listProjects() {
  return request(`${GRAPH_PREFIX}/project/list`);
}

export async function getProject(projectId) {
  return request(`${GRAPH_PREFIX}/project/${encodeURIComponent(projectId)}`);
}

/**
 * PLACEHOLDER — endpoint path/shape not yet confirmed against a live instance.
 * Will be firmed up once a real MiroFish deployment is reachable (simulation.py
 * is a 94KB module not yet read end-to-end). Do not wire this into a route until
 * confirmed.
 */
export async function runSimulation(_params) {
  const error = new Error('runSimulation is not yet wired to a confirmed MiroFish endpoint');
  error.statusCode = 501;
  throw error;
}

/**
 * PLACEHOLDER — same caveat as runSimulation, pending reading report_agent.py /
 * report.py against a live instance.
 */
export async function getReport(_params) {
  const error = new Error('getReport is not yet wired to a confirmed MiroFish endpoint');
  error.statusCode = 501;
  throw error;
}
