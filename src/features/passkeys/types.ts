export type PasskeySupportStatus =
  | 'supported'
  | 'unsupported'
  | 'requires_native_bridge'
  | 'unknown';

export interface PasskeySupportResult {
  status: PasskeySupportStatus;
  reason:
    | 'available'
    | 'native_runtime'
    | 'insecure_origin'
    | 'missing_webauthn'
    | 'missing_client_api'
    | 'no_platform_authenticator'
    | 'probe_failed'
    | 'probe_timeout'
    | 'server_render';
}

export interface PasskeyRecord {
  id: string;
  friendlyName: string;
  createdAt: string;
  lastUsedAt?: string;
}
