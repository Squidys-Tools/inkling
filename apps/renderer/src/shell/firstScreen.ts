// No Promise.withResolvers: it needs Safari 17.4 and this module runs at boot.
let rendered!: () => void;

/**
 * Settles once the screen the window opens on has rendered: the library, or
 * the welcome on a first launch. main.tsx shows the window after it paints.
 */
export const firstScreen = new Promise<void>((resolve) => (rendered = resolve));
export const firstScreenRendered = () => rendered();
