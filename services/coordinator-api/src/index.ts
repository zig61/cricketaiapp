import { loadEnv } from "./config/env.js";
import { buildApp } from "./app.js";

const env = loadEnv();
const app = await buildApp(env);

app
  .listen({ port: env.PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`coordinator-api listening on :${env.PORT}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
