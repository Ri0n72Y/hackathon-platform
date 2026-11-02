import type { Context } from "@deepseek-ai/cordis";
import { TopicPageContainer } from "./container";
import { TopicPageService } from "./service";

/** @summary Register the standalone TopicPage UI entry with Cordis. */
export const topicPage = {
  name: "topic-page",
  inject: ["reactUI", "topicPage"],
  apply(ctx: Context) {
    const service = ctx.topicPage;
    ctx.effect(() =>
      ctx.reactUI.register("topic-page", () => (
        <TopicPageContainer service={service} />
      )),
    );
  },
};

export { TopicPageService };
export type {
  TopicPageError,
  TopicRepository,
  TopicRoute,
  TopicSnapshot,
} from "./service";
