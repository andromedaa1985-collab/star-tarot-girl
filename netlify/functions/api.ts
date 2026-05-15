import serverless from "serverless-http";
import app from "../../api/index";

const serverlessHandler = serverless(app);

export const handler = (event: any, context: any) => {
  const path = event.path || "";
  let normalizedPath = path;

  if (path === "/.netlify/functions/api") {
    normalizedPath = "/api";
  } else if (path.startsWith("/.netlify/functions/api/")) {
    normalizedPath = `/api/${path.slice("/.netlify/functions/api/".length)}`;
  } else if (!path.startsWith("/api")) {
    normalizedPath = `/api${path.startsWith("/") ? path : `/${path}`}`;
  }

  return serverlessHandler(
    {
      ...event,
      path: normalizedPath,
      rawPath: normalizedPath,
    },
    context,
  );
};
