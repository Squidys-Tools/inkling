import type { LibraryStatus } from "@inkling/contracts";
import { useEffect, useState } from "react";
import { libraryClient } from "../library/connection.ts";
import { Page } from "./Page.tsx";

export function LibraryPage() {
  const [status, setStatus] = useState<LibraryStatus | string>("Opening the library…");
  useEffect(() => {
    libraryClient()
      .then((client) => client.status({}))
      .then(setStatus, (error: Error) => setStatus(error.message));
  }, []);
  return (
    <Page title="Library">
      <p>{typeof status === "string" ? status : `${status.itemCount} items`}</p>
    </Page>
  );
}
