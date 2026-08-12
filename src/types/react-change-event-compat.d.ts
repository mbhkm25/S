import type { ChangeEvent as ChangeEventType } from 'react';

declare global {
  namespace React {
    type ChangeEvent<T = Element> = ChangeEventType<T>;
  }
}

export {};
