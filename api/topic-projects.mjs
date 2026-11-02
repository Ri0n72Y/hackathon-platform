import {
  content,
  errorResponse,
  github,
  json,
  parseYaml,
  repoPath,
  validRepo,
} from "./_topic.mjs";

export default {
  async fetch(request) {
    const params = new URL(request.url).searchParams;
    const owner = params.get("owner"),
      repo = params.get("repo");
    const page = Math.max(1, Number(params.get("page") || 1));
    if (!validRepo(owner, repo) || !Number.isInteger(page))
      return json({ error: "TopicPage 项目查询参数无效", stage: "route" }, 400);
    try {
      const config = await content(owner, repo, "topics.config.yaml");
      const topic = parseYaml(config).topic;
      if (typeof topic !== "string" || !topic.trim())
        return json(
          {
            error: "topics.config.yaml 缺少有效的 topic 字段",
            stage: "config",
          },
          422,
        );
      if (page > 34)
        return json({
          page,
          perPage: 30,
          totalCount: 1000,
          hasNext: false,
          windowExhausted: true,
          items: [],
        });
      const data = await github(
        "/search/repositories?q=topic:" +
          encodeURIComponent(topic.trim()) +
          "&sort=updated&order=desc&per_page=30&page=" +
          page,
      );
      const totalCount = Number(data.total_count) || 0;
      const accessibleTotal = Math.min(totalCount, 1000);
      const hasNext = page * 30 < accessibleTotal;
      return json({
        page,
        perPage: 30,
        totalCount,
        hasNext,
        windowExhausted: totalCount > 1000 && !hasNext,
        items: data.items.map((item) => ({
          full_name: item.full_name,
          name: item.name,
          owner: item.owner?.login,
          description: item.description || "",
          html_url: item.html_url,
          stargazers_count: item.stargazers_count,
          language: item.language,
        })),
      });
    } catch (error) {
      error.stage =
        error?.stage ||
        (error?.status === 403
          ? "topic-search"
          : error?.path?.includes("/contents/")
            ? "config"
            : "projects");
      return errorResponse(error, error.stage);
    }
  },
};
