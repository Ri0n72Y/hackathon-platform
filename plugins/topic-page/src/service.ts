import { Service, type Context } from "@deepseek-ai/cordis";

export type TopicRoute = { owner: string; repo: string };
export type TopicRepository = {
  full_name: string;
  name: string;
  owner?: string;
  description: string;
  html_url: string;
  stargazers_count: number;
  language?: string;
};
export type TopicSnapshot = {
  repository: {
    owner: string;
    name: string;
    full_name: string;
    html_url: string;
  };
  readme: string;
  coverUrl: string;
  config: { topic: string; whitelist: boolean };
  allowedRepositories: string[];
};
export type TopicProjectsPage = {
  page: number;
  perPage: number;
  totalCount: number;
  hasNext: boolean;
  windowExhausted: boolean;
  items: TopicRepository[];
};
export type TopicPageError = Error & {
  stage?: string;
  status?: number;
  retryable?: boolean;
};

declare module "@deepseek-ai/cordis" {
  interface Context {
    topicPage: TopicPageService;
  }
}

/** @summary Fetch TopicPage metadata and paged GitHub Topic results. */
export class TopicPageService extends Service {
  constructor(ctx: Context) {
    super(ctx, "topicPage");
  }

  async getSnapshot(
    route: TopicRoute,
    signal?: AbortSignal,
  ): Promise<TopicSnapshot> {
    return this.read(
      "/api/topic-page?owner=" +
        encodeURIComponent(route.owner) +
        "&repo=" +
        encodeURIComponent(route.repo),
      signal,
    );
  }

  async getProjects(
    route: TopicRoute,
    page: number,
    signal?: AbortSignal,
  ): Promise<TopicProjectsPage> {
    return this.read(
      "/api/topic-projects?owner=" +
        encodeURIComponent(route.owner) +
        "&repo=" +
        encodeURIComponent(route.repo) +
        "&page=" +
        page,
      signal,
    );
  }

  private async read(url: string, signal?: AbortSignal) {
    const response = await fetch(url, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(body.error || "HTTP " + response.status), {
        stage: body.stage,
        status: body.status || response.status,
        retryable: body.retryable !== false,
      });
    }
    return body;
  }
}
