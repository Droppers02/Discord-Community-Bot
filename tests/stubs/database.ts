// Test stub for the `#database` module. Query helpers throw if a test actually hits
// them, which surfaces missing mocks instead of silently touching a real database.
function notMocked(): never {
    throw new Error("#database stub called — mock the repository in your test.");
}

export const db = {} as unknown;
export async function query(): Promise<never> {
    return notMocked();
}
export async function queryOne(): Promise<never> {
    return notMocked();
}
export async function withTransaction(): Promise<never> {
    return notMocked();
}
export async function initDatabase(): Promise<void> {}
export async function closeDatabase(): Promise<void> {}
export function releaseLock(): void {}
