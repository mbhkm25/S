(() => {
  'use strict';

  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver || window.__SANAD_OPERATIONAL_OBSERVER_GUARD__) return;

  window.__SANAD_OPERATIONAL_OBSERVER_GUARD__ = true;

  window.MutationObserver = class SanadGuardedMutationObserver extends NativeMutationObserver {
    constructor(callback) {
      super((records, observer) => {
        const meaningfulRecords = records.filter(record =>
          !(record.type === 'attributes' && record.attributeName === 'data-count')
        );
        if (meaningfulRecords.length) callback(meaningfulRecords, observer);
      });
    }
  };
})();