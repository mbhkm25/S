export interface PasskeyRequestContext {
  mounted: boolean;
  activeUserId: string;
  requestUserId: string;
  currentGeneration: number;
  requestGeneration: number;
}

export function isPasskeyRequestCurrent(context: PasskeyRequestContext): boolean {
  return context.mounted &&
    context.activeUserId === context.requestUserId &&
    context.currentGeneration === context.requestGeneration;
}
