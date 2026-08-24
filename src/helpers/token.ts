import crypto from "node:crypto";

export const tokenHash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
