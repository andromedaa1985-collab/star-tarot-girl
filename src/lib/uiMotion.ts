/** Shared timing for task-oriented UI. Values are seconds, as expected by Motion. */
export const MOTION_EASE = [0.22, 1, 0.36, 1] as const;
export const MOTION_DURATION = { fast: 0.14, standard: 0.22, exit: 0.16 } as const;

const navigationGroups = [
  ['/app'],
  ['/app/diary'],
  ['/app/explore', '/app/deck', '/app/bazi', '/app/simulator', '/app/guardian', '/app/collection'],
  ['/app/profile', '/app/settings', '/app/about', '/app/analytics', '/app/admin'],
];

function navigationIndex(path: string) {
  return navigationGroups.findIndex((group, index) => group.some(base =>
    path === base || (index !== 0 && path.startsWith(`${base}/`)),
  ));
}

/** Query changes stay in the same workspace. Nested pages follow their parent tab. */
export function getNavigationDirection(previousPath: string, nextPath: string): -1 | 0 | 1 {
  const fromPath = previousPath.split(/[?#]/)[0].replace(/\/$/, '');
  const toPath = nextPath.split(/[?#]/)[0].replace(/\/$/, '');
  if (fromPath === toPath) return 0;
  const from = navigationIndex(fromPath);
  const to = navigationIndex(toPath);
  if (from < 0 || to < 0) return 0;
  if (from !== to) return from < to ? 1 : -1;
  if (toPath === navigationGroups[to][0] || fromPath.startsWith(`${toPath}/`)) return -1;
  return 1;
}
