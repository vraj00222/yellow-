import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Open a fix PR on a GitHub repo using the `gh` CLI (already authenticated).
 * No token management, no local clone — all via the GitHub REST API through gh.
 */
async function gh(args: string[]): Promise<string> {
  const { stdout } = await run('gh', args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function getFile(repo: string, path: string): Promise<{ content: string; sha: string }> {
  const j = JSON.parse(await gh(['api', `repos/${repo}/contents/${path}`])) as {
    content: string;
    sha: string;
  };
  return { content: Buffer.from(j.content, 'base64').toString('utf8'), sha: j.sha };
}

export interface FixPR {
  repo: string;
  path: string;
  newContent: string;
  /** Current file blob sha (from getFile). */
  sha: string;
  branch: string;
  commitMsg: string;
  title: string;
  body: string;
}

export async function openFixPR(opts: FixPR): Promise<string> {
  const { repo, path, newContent, sha, branch, commitMsg, title, body } = opts;

  // Base the new branch on the default branch's tip.
  const ref = JSON.parse(await gh(['api', `repos/${repo}/git/ref/heads/main`])) as {
    object: { sha: string };
  };
  await gh([
    'api', '-X', 'POST', `repos/${repo}/git/refs`,
    '-f', `ref=refs/heads/${branch}`,
    '-f', `sha=${ref.object.sha}`,
  ]);

  // Commit the corrected file onto the branch.
  await gh([
    'api', '-X', 'PUT', `repos/${repo}/contents/${path}`,
    '-f', `message=${commitMsg}`,
    '-f', `content=${Buffer.from(newContent, 'utf8').toString('base64')}`,
    '-f', `branch=${branch}`,
    '-f', `sha=${sha}`,
  ]);

  // Open the pull request.
  const pr = JSON.parse(
    await gh([
      'api', '-X', 'POST', `repos/${repo}/pulls`,
      '-f', `title=${title}`,
      '-f', `head=${branch}`,
      '-f', 'base=main',
      '-f', `body=${body}`,
    ]),
  ) as { html_url: string };
  return pr.html_url;
}

export function ghAvailable(): boolean {
  return Boolean(process.env.GITHUB_FIX_REPO && process.env.GITHUB_FIX_PATH);
}
