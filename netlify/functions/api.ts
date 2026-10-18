import serverless from "serverless-http";
import { withLambda, type HandlerResponse } from "@netlify/aws-lambda-compat";
import app from "../../api/index";

const serverlessHandler = serverless(app);

// Keep Netlify's modern runtime context intact. connectLambda replaces it with
// legacy credentials that omit uncachedEdgeURL, breaking every strong read.
export default withLambda(async (event, context) => {
  const path = event.path || "";
  let normalizedPath = path;

  if (path === "/.netlify/functions/api") {
    normalizedPath = "/api";
  } else if (path.startsWith("/.netlify/functions/api/")) {
    normalizedPath = `/api/${path.slice("/.netlify/functions/api/".length)}`;
  } else if (!path.startsWith("/api")) {
    normalizedPath = `/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  const response = await serverlessHandler(
    {
      ...event,
      path: normalizedPath,
      rawPath: normalizedPath,
    },
    context,
  ) as HandlerResponse;
  // Express represents an empty response as ""; the web Response constructor
  // requires an absent body for these status codes, including CORS preflights.
  if ([204, 205, 304].includes(response.statusCode)) delete response.body;
  return response;
});
