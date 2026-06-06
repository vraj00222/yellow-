/** Thrown when a capsule id has no stored branch or meta. */
export class CapsuleNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No capsule found for id "${id}"`);
    this.name = 'CapsuleNotFoundError';
  }
}
