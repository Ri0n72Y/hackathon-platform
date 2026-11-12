/** @summary A collision-free React identity for a repository configuration page. */
export function configTargetKey(owner, repo) {
  return JSON.stringify([owner, repo])
}
