// Test stub for the `#base` module (the constatic creators). No-ops so importing a
// command/responder/event file in a test doesn't register anything.
export function createCommand(): void {}
export function createEvent(): void {}
export function createResponder(): void {}
export function createRawEvent(): void {}
export function commandPayload(): unknown[] {
    return [];
}
