/** A photo POST does not invalidate Next's client-prefetched guard redirects.
 * A document GET reads the saved draft afresh. It never resubmits the upload,
 * payment or generation request. Also works for the paid-photo recovery route.
 */
export function navigateToSavedStep(href: string): void {
  window.location.assign(href);
}
