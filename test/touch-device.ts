/**
 * States whether the test DOM is a touch device.
 *
 * Happy DOM answers `(pointer: coarse)` and `(pointer: fine)` from
 * `navigator.maxTouchPoints` in its browser settings, so a touch device is
 * stated there rather than by replacing `matchMedia`. The same setting also
 * decides `(hover: none)`. A test that sets it resets it with
 * `setTouchDevice(false)` in an `afterEach`: the settings are shared by every
 * test file in the run.
 */

const settings = (
  window as unknown as {
    happyDOM: { settings: { navigator: { maxTouchPoints: number } } }
  }
).happyDOM.settings

export function setTouchDevice(touch: boolean): void {
  settings.navigator.maxTouchPoints = touch ? 5 : 0
}
