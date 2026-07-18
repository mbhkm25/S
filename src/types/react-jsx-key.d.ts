import type { Key } from 'react';

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: Key | null;
    }
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: Key | null;
    }
  }
}
