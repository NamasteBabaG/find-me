import path from "node:path";

/**
 * Where the private review world lives on disk.
 *
 * These folders hold a real child's illustrated appearances, so they stay out of
 * `public/` and out of git and are only ever served by the gated dev route.
 * There is now more than one of them - each round of the engine builds its own
 * and none may overwrite another - so which one is open is a server setting with
 * the first one as its default. It is read from the server's own environment and
 * never from a request, and the route still proves every resolved file sits
 * inside the folder before reading it.
 */
export const privateReviewRoot = () =>
  path.resolve(process.cwd(), process.env.PRIVATE_REVIEW_DIR ?? "work/private-game-20260909");
