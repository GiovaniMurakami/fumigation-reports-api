import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

async function start() {
  const { app } = await import("./app");
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`API de fumigação em http://localhost:${port}`));
}
start();
