import 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: string | number | null;
    }
  }
}
