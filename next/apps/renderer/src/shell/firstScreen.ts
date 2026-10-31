const rendered = Promise.withResolvers<void>();

/**
 * Settles once the screen the window opens on has rendered: the library, or
 * the welcome on a first launch. main.tsx shows the window after it paints.
 */
export const firstScreen = rendered.promise;
export const firstScreenRendered = () => rendered.resolve();
