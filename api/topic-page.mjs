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
    if (!validRepo(owner, repo))
      return json(
        { error: "TopicPage 路由中的仓库参数无效", stage: "route" },
        400,
      );
    try {
      const repository = await github(repoPath(owner, repo));
      if (repository.private)
        return json(
          { error: "TopicPage 只支持公开仓库", stage: "repository" },
          403,
        );
      let readme;
      try {
        readme = await content(owner, repo, "README.md");
      } catch (error) {
        error.stage = "readme";
        throw error;
      }
      let config;
      try {
        config = parseYaml(await content(owner, repo, "topics.config.yaml"));
      } catch (error) {
        error.stage = "config";
        throw error;
      }
      if (typeof config.topic !== "string" || !config.topic.trim()) {
        return json(
          {
            error: "topics.config.yaml 缺少有效的 topic 字段",
            stage: "config",
          },
          422,
        );
      }
      if (
        config.whitelist !== undefined &&
        typeof config.whitelist !== "boolean"
      )
        return json(
          {
            error: "topics.config.yaml 的 whitelist 必须是布尔值",
            stage: "config",
            retryable: false,
          },
          422,
        );
      const whitelist = config.whitelist !== false;
      const allowed = [];
      if (whitelist) {
        let entries;
        try {
          entries = await github(repoPath(owner, repo, "/contents/projects"));
        } catch (error) {
          error.stage = "whitelist";
          throw error;
        }
        if (!Array.isArray(entries)) throw new Error("projects 目录格式异常");
        for (const entry of entries.filter((item) =>
          /\.ya?ml$/i.test(item.name),
        )) {
          try {
            const project = parseYaml(await content(owner, repo, entry.path));
            if (typeof project.repository === "string")
              allowed.push(project.repository.toLowerCase());
          } catch {
            /* malformed entries are ignored by the data source; the page still reports usable entries */
          }
        }
      }
      return json({
        repository: {
          owner,
          name: repo,
          full_name: repository.full_name,
          html_url: repository.html_url,
        },
        readme,
        coverUrl:
          "https://raw.githubusercontent.com/" +
          encodeURIComponent(owner) +
          "/" +
          encodeURIComponent(repo) +
          "/HEAD/cover.jpg",
        config: { topic: config.topic.trim(), whitelist },
        allowedRepositories: allowed,
      });
    } catch (error) {
      const stage =
        error?.stage ||
        (error?.path?.includes("/contents/")
          ? "source"
          : error?.status === 404
            ? "repository"
            : "source");
      return errorResponse(error, stage);
    }
  },
};
