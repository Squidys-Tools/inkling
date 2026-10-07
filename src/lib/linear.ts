const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export type LinearTeam = {
  id: string;
  name: string;
  key: string;
};

export type CreatedLinearIssue = {
  id: string;
  identifier: string;
  url: string;
  title: string;
};

type GraphQlResult<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

function readEnv(name: string): string | undefined {
  const value = (import.meta.env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Vite only exposes VITE_-prefixed variables to the client, so accept both the
// canonical LINEAR_API_KEY and its VITE_-prefixed mirror.
export function linearApiKey(): string | undefined {
  return readEnv("LINEAR_API_KEY") ?? readEnv("VITE_LINEAR_API_KEY");
}

export function hasLinearApiKey(): boolean {
  return linearApiKey() !== undefined;
}

async function linearRequest<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = linearApiKey();
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not set. Add it in the Keys tab, then reload.");
  }

  let response: Response;
  try {
    response = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("Could not reach Linear. Check your network connection.");
  }

  const payload = (await response.json().catch(() => null)) as GraphQlResult<T> | null;

  if (!response.ok) {
    const detail = payload?.errors?.[0]?.message;
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        detail ?? "Linear rejected the API key. Regenerate it in Linear's Security & access settings.",
      );
    }
    throw new Error(detail ?? `Linear's API returned HTTP ${response.status}.`);
  }

  if (payload?.errors?.length) {
    const messages = payload.errors.map((error) => error.message).filter(Boolean).join(" ");
    throw new Error(messages || "Linear returned an error.");
  }
  if (!payload?.data) {
    throw new Error("Linear returned an unexpected response.");
  }
  return payload.data;
}

export async function fetchLinearTeams(): Promise<LinearTeam[]> {
  const data = await linearRequest<{ teams: { nodes: LinearTeam[] } }>(
    `query InklingTeams {
      teams {
        nodes {
          id
          name
          key
        }
      }
    }`,
  );
  return data.teams.nodes;
}

export async function createLinearIssue(input: {
  teamId: string;
  title: string;
  description: string;
}): Promise<CreatedLinearIssue> {
  const data = await linearRequest<{
    issueCreate: { success: boolean; issue: CreatedLinearIssue | null };
  }>(
    `mutation InklingIssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
          title
        }
      }
    }`,
    { input },
  );

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error("Linear could not create this issue.");
  }
  return data.issueCreate.issue;
}
