export function parseRepo(repoStr) {
  const parts = repoStr.replace(/^https:\/\/github\.com\//, '').split('/');
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, '');
  if (!owner || !repo) {
    throw new Error(`Invalid repo format: ${repoStr}. Use "owner/repo" or full GitHub URL.`);
  }
  return { owner, repo };
}

export function parseRepoList(raw) {
  if (!raw?.trim()) return [];

  const repos = [];
  const seen = new Set();

  for (const item of raw.split(/[\n,]+/)) {
    const trimmed = item.trim();
    if (!trimmed) continue;

    try {
      const { owner, repo } = parseRepo(trimmed);
      const fullName = `${owner}/${repo}`;
      if (!seen.has(fullName)) {
        seen.add(fullName);
        repos.push(fullName);
      }
    } catch {
      console.warn(`[config] Invalid repo entry ignored: ${trimmed}`);
    }
  }

  return repos;
}
