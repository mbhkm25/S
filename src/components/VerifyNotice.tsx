import DirectQrScanner from './DirectQrScanner';
import LegacyVerifyNotice, { extractPublicToken } from './VerifyNoticeLegacy';

export { extractPublicToken };

interface VerifyNoticeProps {
  onNavigateToDetails: (token: string) => void;
  directCameraOnly?: boolean;
  onCancelDirectCamera?: () => void;
}

/**
 * Stable source-level router for verification entry points.
 *
 * The dedicated scan-qr route uses DirectQrScanner directly. All search,
 * paste, manual-token, and legacy verification flows remain in the existing
 * VerifyNotice implementation. No build-time source rewriting is required.
 */
export default function VerifyNotice({
  onNavigateToDetails,
  directCameraOnly = false,
  onCancelDirectCamera,
}: VerifyNoticeProps) {
  if (directCameraOnly) {
    return (
      <DirectQrScanner
        onNavigateToDetails={onNavigateToDetails}
        onCancel={onCancelDirectCamera ?? (() => undefined)}
      />
    );
  }

  return (
    <LegacyVerifyNotice
      onNavigateToDetails={onNavigateToDetails}
      directCameraOnly={false}
      onCancelDirectCamera={onCancelDirectCamera}
    />
  );
}
