/**
 * GitHub OAuth + PR creation for Wireline Design code handoff.
 */
import { fetchWithTimeout } from "./server-context";
import { loadDesignIntegration, type DesignIntegrationProvider } from "./design-integrations";

const GITHUB_PROVIDER: DesignIntegrationProvider = "github";

export const GITHUB_DESIGN_SCOPES = "repo read:user";

export function githubDesignOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DESIGN_CLIENT_ID?.trim() && process.env.GITHUB_DESIGN_CLIENT_SECRET?.trim(),
  );
}

export function getGithubDesignAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_DESIGN_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: GITHUB_DESIGN_SCOPES,
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGithubDesignCode(
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; scope: string }> {
  const r = await fetchWithTimeout(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_DESIGN_CLIENT_ID,
        client_secret: process.env.GITHUB_DESIGN_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    },
    25_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.error_description || data.error || "GitHub token exchange failed"));
  }

  return data as { access_token: string; scope: string };
}

export async function getGithubAccessToken(userId: string): Promise<string | null> {
  const conn = await loadDesignIntegration(userId, GITHUB_PROVIDER);
  return conn?.accessToken ?? null;
}

export async function fetchGithubUser(accessToken: string): Promise<{ login: string }> {
  const r = await fetchWithTimeout("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const data = (await r.json()) as { login?: string };
  if (!r.ok || !data.login) throw new Error("Failed to fetch GitHub user");
  return { login: data.login };
}

export interface GithubRepoSummary {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export async function listGithubRepos(userId: string, limit = 30): Promise<GithubRepoSummary[]> {
  const token = await getGithubAccessToken(userId);
  if (!token) throw new Error("GitHub is not connected.");

  const r = await fetchWithTimeout(
    `https://api.github.com/user/repos?per_page=${Math.min(limit, 100)}&sort=updated`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
    30_000,
  );

  const data = (await r.json()) as Array<{
    full_name?: string;
    default_branch?: string;
    private?: boolean;
  }>;
  if (!r.ok) throw new Error("Failed to list GitHub repositories");

  return data
    .filter((repo) => repo.full_name)
    .map((repo) => ({
      fullName: repo.full_name!,
      defaultBranch: repo.default_branch || "main",
      private: Boolean(repo.private),
    }));
}

function slugifyBranch(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 10);
  return `wireline-design/${slug || "export"}-${stamp}`;
}

export interface CreateDesignPrInput {
  userId: string;
  owner: string;
  repo: string;
  baseBranch?: string;
  title: string;
  body: string;
  files: Array<{ path: string; content: Buffer }>;
}

export interface CreateDesignPrResult {
  prUrl: string;
  branch: string;
  prNumber: number;
}

export async function createDesignGithubPr(
  input: CreateDesignPrInput,
): Promise<CreateDesignPrResult> {
  const token = await getGithubAccessToken(input.userId);
  if (!token) throw new Error("GitHub is not connected.");

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  const baseBranch = input.baseBranch || "main";
  const branch = slugifyBranch(input.title);

  const baseRefRes = await fetchWithTimeout(
    `https://api.github.com/repos/${input.owner}/${input.repo}/git/ref/heads/${baseBranch}`,
    { headers },
    20_000,
  );
  const baseRef = (await baseRefRes.json()) as { object?: { sha?: string } };
  if (!baseRefRes.ok || !baseRef.object?.sha) {
    throw new Error(`Could not resolve base branch ${baseBranch}`);
  }

  const createRefRes = await fetchWithTimeout(
    `https://api.github.com/repos/${input.owner}/${input.repo}/git/refs`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseRef.object.sha }),
    },
    20_000,
  );
  if (!createRefRes.ok) {
    const err = (await createRefRes.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message || "Failed to create branch");
  }

  for (const file of input.files) {
    if (file.path.includes("..") || file.path.startsWith("/")) {
      throw new Error(`Invalid file path: ${file.path}`);
    }
    const encodedPath = file.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const putRes = await fetchWithTimeout(
      `https://api.github.com/repos/${input.owner}/${input.repo}/contents/${encodedPath}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Add ${file.path} from Wireline Design`,
          content: file.content.toString("base64"),
          branch,
        }),
      },
      30_000,
    );
    if (!putRes.ok) {
      const err = (await putRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to commit ${file.path}`);
    }
  }

  const prRes = await fetchWithTimeout(
    `https://api.github.com/repos/${input.owner}/${input.repo}/pulls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: input.title.slice(0, 120),
        body: input.body,
        head: branch,
        base: baseBranch,
      }),
    },
    30_000,
  );

  const pr = (await prRes.json()) as { html_url?: string; number?: number };
  if (!prRes.ok || !pr.html_url) {
    const err = pr as { message?: string };
    throw new Error(err.message || "Failed to open pull request");
  }

  return { prUrl: pr.html_url, branch, prNumber: pr.number ?? 0 };
}
