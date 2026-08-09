import androidRelease from '../../config/android-release.json';

export const SANAD_APP_VERSION = String(import.meta.env.VITE_APP_VERSION || androidRelease.version_code);
