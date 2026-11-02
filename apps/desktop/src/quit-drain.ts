/** Hold all quit attempts until asynchronous cleanup finishes, including repeated Cmd/Quit. */
export function createQuitDrain(
  drain: () => Promise<void>,
  quit: () => void,
  failed: (error: unknown) => void,
) {
  let done = false;
  let pending: Promise<void> | undefined;
  return (event: { preventDefault: () => void }) => {
    if (done) return;
    event.preventDefault();
    pending ??= Promise.resolve()
      .then(drain)
      .then(
        () => {
          done = true;
          quit();
        },
        (error) => {
          pending = undefined;
          failed(error);
        },
      );
  };
}
