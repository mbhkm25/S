import type { ReactNode as ReactNodeType } from 'react';

declare global {
  namespace React {
    type ReactNode = ReactNodeType;
  }
}

export {};
