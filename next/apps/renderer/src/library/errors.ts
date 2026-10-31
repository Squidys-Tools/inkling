/** The library's LibraryError carries a message written for the user; other failures get a plain one. */
export function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "Something went wrong.";
}
