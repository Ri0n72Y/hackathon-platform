import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { TopicPageView } from "./view";
import type {
  TopicPageError,
  TopicRoute,
  TopicRepository,
  TopicSnapshot,
  TopicPageService,
} from "./service";

function routeFromPathname(): TopicRoute | null {
  const match = location.pathname.match(/^\/topic\/([^/]+)\/([^/]+)\/?$/);
  return match &&
    /^[a-z\d-]{1,39}$/i.test(match[1]) &&
    /^[a-z\d._-]{1,100}$/i.test(match[2])
    ? {
        owner: decodeURIComponent(match[1]),
        repo: decodeURIComponent(match[2]),
      }
    : null;
}

/** @summary Load TopicPage metadata and projects with cancellation and pagination. */
function useTopicPageData(service: TopicPageService, route: TopicRoute | null) {
  const [snapshot, setSnapshot] = useState<TopicSnapshot | null>(null);
  const [projects, setProjects] = useState<TopicRepository[]>([]);
  const [loading, setLoading] = useState(Boolean(route));
  const [error, setError] = useState<TopicPageError | null>(null);
  const revision = useRef(0);
  const activeAbort = useRef<AbortController | null>(null);

  const load = () => {
    if (!route) return;
    const current = ++revision.current;
    activeAbort.current?.abort();
    const controller = new AbortController();
    activeAbort.current = controller;
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setProjects([]);
    void (async () => {
      try {
        const meta = await service.getSnapshot(route, controller.signal);
        if (current !== revision.current) return;
        setSnapshot(meta);
        const next: TopicRepository[] = [];
        const seen = new Set<string>();
        let page = 1;
        let hasNext = true;
        while (hasNext && next.length < 10 && !controller.signal.aborted) {
          const result = await service.getProjects(
            route,
            page,
            controller.signal,
          );
          if (current !== revision.current) return;
          for (const item of result.items) {
            const key = item.full_name.toLowerCase();
            if (
              (!meta.config.whitelist ||
                meta.allowedRepositories.includes(key)) &&
              !seen.has(key) &&
              key !== meta.repository.full_name.toLowerCase()
            ) {
              seen.add(key);
              next.push(item);
            }
          }
          hasNext = result.hasNext && !result.windowExhausted;
          page += 1;
        }
        if (current === revision.current) {
          setProjects(next);
          setLoading(false);
        }
      } catch (cause) {
        if (
          current !== revision.current ||
          (cause instanceof DOMException && cause.name === "AbortError")
        )
          return;
        setError(cause as TopicPageError);
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  };

  useEffect(() => {
    const cancel = load();
    return () => {
      revision.current += 1;
      activeAbort.current?.abort();
      cancel?.();
    };
  }, [route?.owner, route?.repo]);

  return { snapshot, projects, loading, error, retry: load };
}

/** @summary Manage authenticated error reporting for a TopicPage failure. */
function useTopicPageReport(
  route: TopicRoute | null,
  error: TopicPageError | null,
  session: "checking" | "connected" | "anonymous",
) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const openReport = () => {
    if (!route || !error || session !== "connected") return;
    setTitle(
      `[TopicPage] ${error.stage || "加载"}失败：${route.owner}/${route.repo}`,
    );
    setBody(
      `页面路由：/topic/${route.owner}/${route.repo}/\n阶段：${error.stage || "unknown"}\nHTTP：${error.status || "unknown"}\n说明：${error.message}\n时间：${new Date().toISOString()}`,
    );
    setMessage("");
    setOpen(true);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!route || !title.trim() || !body.trim()) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/github-topic-issue-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LabourChain-Write": "1",
        },
        body: JSON.stringify({
          owner: route.owner,
          repo: route.repo,
          title: title.trim(),
          body,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "提交失败");
      setUrl(data.issue.html_url);
      setOpen(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  };
  return {
    open,
    title,
    body,
    pending,
    message,
    url,
    canReport: session === "connected",
    openReport,
    closeReport: () => setOpen(false),
    setTitle,
    setBody,
    submit,
  };
}

/** @summary Connect TopicPage services, session state and pure presentation. */
export function TopicPageContainer({ service }: { service: TopicPageService }) {
  const route = useMemo(routeFromPathname, []);
  const data = useTopicPageData(service, route);
  const [session, setSession] = useState<
    "checking" | "connected" | "anonymous"
  >("checking");
  const report = useTopicPageReport(route, data.error, session);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/github-session", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) =>
        response.ok ? response.json() : { authenticated: false },
      )
      .then((result) => {
        if (!controller.signal.aborted)
          setSession(result.authenticated ? "connected" : "anonymous");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession("anonymous");
      });
    return () => controller.abort();
  }, []);
  if (!route)
    return (
      <main>
        <div>
          TopicPage 地址无效。请使用 /topic/&lt;owner&gt;/&lt;repository&gt;/
        </div>
      </main>
    );
  return (
    <TopicPageView
      snapshot={data.snapshot}
      projects={data.projects}
      loading={data.loading}
      error={data.error}
      report={report}
      canReport={report.canReport}
      onRetry={data.retry}
      onOpenReport={report.openReport}
      onCloseReport={report.closeReport}
      onReportTitleChange={report.setTitle}
      onReportBodyChange={report.setBody}
      onSubmitReport={report.submit}
    />
  );
}
