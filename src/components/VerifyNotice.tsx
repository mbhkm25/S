import NativeAndroidQrScanner from './NativeAndroidQrScanner';
import LegacyVerifyNotice, { extractPublicToken } from './VerifyNoticeLegacy';

export { extractPublicToken };

interface VerifyNoticeProps {
  onNavigateToDetails: (token: string) => void;
  directCameraOnly?: boolean;
  onCancelDirectCamera?: () => void;
}

export default function VerifyNotice({
  onNavigateToDetails,
  directCameraOnly = false,
  onCancelDirectCamera,
}: VerifyNoticeProps) {
  if (directCameraOnly) {
    return (
      <NativeAndroidQrScanner
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
