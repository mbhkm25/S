// Browser camera capabilities supported by Chromium-based mobile browsers but not yet present
// in every TypeScript DOM library version used by the project.
interface MediaTrackConstraintSet {
  resizeMode?: ConstrainDOMString;
}
