import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createAuthClient, getDriveClient } from "./auth.js";
import { registerFileTools } from "./tools/files.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerPermissionTools } from "./tools/permissions.js";
import { registerCommentTools, registerRevisionTools } from "./tools/comments.js";
import { registerDriveTools, registerAboutTools, registerChannelTools } from "./tools/drives.js";
import { drive_v3 } from "@googleapis/drive";

const app = express();

let driveClient: drive_v3.Drive;

try {
  const auth = createAuthClient();
  driveClient = getDriveClient(auth);
  console.error("Google Drive auth initialized successfully.");
} catch (err) {
  console.error("Auth init error:", err);
  process.exit(1);
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "google-drive-mcp-server",
    version: "1.0.0"
  });

  registerFileTools(server, driveClient);
  registerFolderTools(server, driveClient);
  registerPermissionTools(server, driveClient);
  registerCommentTools(server, driveClient);
  registerRevisionTools(server, driveClient);
  registerDriveTools(server, driveClient);
  registerAboutTools(server, driveClient);
  registerChannelTools(server, driveClient);

  return server;
}

const sessions = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  console.error("New SSE connection");
  const transport = new SSEServerTransport("/messages", res);
  const sessionId = transport.sessionId;
  sessions.set(sessionId, transport);

  const server = createMcpServer();

  res.on("close", () => {
    console.error(`SSE closed: ${sessionId}`);
    sessions.delete(sessionId);
  });

  await server.connect(transport);
  console.error(`Session started: ${sessionId}`);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sessions.get(sessionId);
  if (!transport) {
    res.status(404).json({ error: `Session not found: ${sessionId}` });
    return;
  }
  await transport.handlePostMessage(req, res);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "google-drive-mcp-server", sessions: sessions.size, timestamp: new Date().toISOString() });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.error(`Google Drive MCP Server running on port ${PORT}`);
});
