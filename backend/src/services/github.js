import { Octokit } from 'octokit';
import { config, CODE_EXTENSIONS, SKIP_DIRS } from '../config.js';
import { parseRepo } from '../utils/repo.js';

const octokit = new Octokit({ auth: config.github.token });

function shouldIncludeFile(path) {
  const parts = path.split('/');
  if (parts.some((p) => SKIP_DIRS.has(p))) return false;

  const lower = path.toLowerCase();
  if (lower.endsWith('dockerfile')) return true;

  const dot = path.lastIndexOf('.');
  if (dot === -1) return false;
  return CODE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

async function getDefaultBranch(owner, repo) {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

async function listRepoFiles(owner, repo, branch) {
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: 'true',
  });

  return tree.tree
    .filter((item) => item.type === 'blob' && item.path && shouldIncludeFile(item.path))
    .map((item) => ({ path: item.path, sha: item.sha, size: item.size || 0 }));
}

async function getFileContent(owner, repo, path) {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || data.type !== 'file') return null;
    if (data.size > 500_000) return null;

    const content = Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    return content;
  } catch {
    return null;
  }
}

export async function fetchRepoFiles(repoStr) {
  const { owner, repo } = parseRepo(repoStr);
  const branch = await getDefaultBranch(owner, repo);
  const files = await listRepoFiles(owner, repo, branch);

  const results = [];
  const batchSize = 10;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const contents = await Promise.all(
      batch.map(async (file) => {
        const content = await getFileContent(owner, repo, file.path);
        if (!content) return null;
        return {
          path: file.path,
          content,
          repo: `${owner}/${repo}`,
          branch,
        };
      })
    );
    results.push(...contents.filter(Boolean));
  }

  return { owner, repo, branch, files: results };
}

export async function listUserRepos() {
  if (!config.github.token) {
    throw new Error('GITHUB_TOKEN is not configured');
  }

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100,
    affiliation: 'owner,organization_member',
  });

  return data.map((r) => ({
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    url: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
  }));
}
