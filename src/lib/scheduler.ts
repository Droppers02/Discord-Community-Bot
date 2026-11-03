// setTimeout overflows past ~24.8 days (2^31-1 ms); clamp and let callers re-schedule.
const MAX_TIMEOUT_MS = 2_147_483_647;

export function clearManagedTimeout(registry: Map<string, NodeJS.Timeout>, key: string): void {
    const timer = registry.get(key);
    if (!timer) return;

    clearTimeout(timer);
    registry.delete(key);
}

export function scheduleManagedTimeout(
    registry: Map<string, NodeJS.Timeout>,
    key: string,
    delay: number,
    callback: () => void,
): void {
    clearManagedTimeout(registry, key);
    const safeDelay = Math.min(Math.max(0, delay), MAX_TIMEOUT_MS);
    registry.set(key, setTimeout(callback, safeDelay));
}
