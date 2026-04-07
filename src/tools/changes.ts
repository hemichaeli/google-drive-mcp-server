import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

export function registerChangeTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_get_start_page_token", {
    title: "Get Start Page Token",
    description: "Get the starting page token for listing future changes. Use this before gdrive_list_changes to establish a baseline.",
    inputSchema: {
      driveId: z.string().optional().describe("Shared drive ID (for shared drive changes)"),
      supportsAllDrives: z.boolean().default(true)
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async ({ driveId, supportsAllDrives }) => {
    try {
      const params: drive_v3.Params$Resource$Changes$Getstartpagetoken = { supportsAllDrives };
      if (driveId) { params.driveId = driveId; }
      const res = await drive.changes.getStartPageToken(params);
      return okText({ startPageToken: res.data.startPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_list_changes", {
    title: "List Changes",
    description: "List changes to files and shared drives since a given page token. Use gdrive_get_start_page_token first to get an initial token.",
    inputSchema: {
      pageToken: z.string().describe("Page token from gdrive_get_start_page_token or previous list_changes call"),
      pageSize: z.number().int().min(1).max(1000).default(100).describe("Max changes per page"),
      includeRemoved: z.boolean().default(true).describe("Include changes for removed files"),
      includeItemsFromAllDrives: z.boolean().default(true),
      driveId: z.string().optional().describe("Shared drive ID to scope changes to"),
      spaces: z.string().optional().describe("Comma-separated spaces to query (e.g. 'drive', 'appDataFolder')")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ pageToken, pageSize, includeRemoved, includeItemsFromAllDrives, driveId, spaces }) => {
    try {
      const params: drive_v3.Params$Resource$Changes$List = {
        pageToken, pageSize, includeRemoved,
        supportsAllDrives: includeItemsFromAllDrives,
        includeItemsFromAllDrives,
        fields: "nextPageToken,newStartPageToken,changes(changeType,time,removed,fileId,file(id,name,mimeType,modifiedTime,trashed,parents,webViewLink,size,lastModifyingUser),driveId,drive(id,name))"
      };
      if (driveId) { params.driveId = driveId; params.includeCorpusRemovals = true; }
      if (spaces) { params.spaces = spaces; }
      const res = await drive.changes.list(params);
      return okText({
        changes: res.data.changes,
        nextPageToken: res.data.nextPageToken,
        newStartPageToken: res.data.newStartPageToken
      });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_watch_changes", {
    title: "Watch for Changes (Push Notifications)",
    description: "Subscribe to push notifications for file changes. Requires a publicly accessible webhook URL.",
    inputSchema: {
      pageToken: z.string().describe("Page token from gdrive_get_start_page_token"),
      webhookUrl: z.string().url().describe("HTTPS URL to receive notifications"),
      channelId: z.string().describe("Unique channel ID you choose (UUID recommended)"),
      expirationMs: z.string().optional().describe("Channel expiration time in milliseconds since epoch"),
      includeItemsFromAllDrives: z.boolean().default(true)
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ pageToken, webhookUrl, channelId, expirationMs, includeItemsFromAllDrives }) => {
    try {
      const requestBody: drive_v3.Schema$Channel = {
        id: channelId,
        type: "web_hook",
        address: webhookUrl
      };
      if (expirationMs) requestBody.expiration = expirationMs;
      const res = await drive.changes.watch({
        pageToken,
        supportsAllDrives: includeItemsFromAllDrives,
        includeItemsFromAllDrives,
        requestBody
      });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_watch_file", {
    title: "Watch File for Changes",
    description: "Subscribe to push notifications when a specific file changes.",
    inputSchema: {
      fileId: z.string().describe("File ID to watch"),
      webhookUrl: z.string().url().describe("HTTPS URL to receive notifications"),
      channelId: z.string().describe("Unique channel ID you choose (UUID recommended)"),
      expirationMs: z.string().optional().describe("Channel expiration in milliseconds since epoch")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ fileId, webhookUrl, channelId, expirationMs }) => {
    try {
      const requestBody: drive_v3.Schema$Channel = {
        id: channelId,
        type: "web_hook",
        address: webhookUrl
      };
      if (expirationMs) requestBody.expiration = expirationMs;
      const res = await drive.files.watch({
        fileId,
        supportsAllDrives: true,
        requestBody
      });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_storage_quota", {
    title: "Get Storage Quota",
    description: "Get the user's Google Drive storage usage and quota details.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  }, async () => {
    try {
      const res = await drive.about.get({ fields: "storageQuota,user" });
      const q = res.data.storageQuota;
      const user = res.data.user;
      return okText({
        user: { displayName: user?.displayName, emailAddress: user?.emailAddress, photoLink: user?.photoLink },
        storageQuota: {
          limit: q?.limit ? `${(Number(q.limit) / 1073741824).toFixed(2)} GB` : "unlimited",
          usage: q?.usage ? `${(Number(q.usage) / 1073741824).toFixed(2)} GB` : "0",
          usageInDrive: q?.usageInDrive ? `${(Number(q.usageInDrive) / 1073741824).toFixed(2)} GB` : "0",
          usageInDriveTrash: q?.usageInDriveTrash ? `${(Number(q.usageInDriveTrash) / 1073741824).toFixed(2)} GB` : "0",
          rawBytes: q
        }
      });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_file_sharing_summary", {
    title: "Get File Sharing Summary",
    description: "Get a quick summary of who has access to a file, including permission roles and types.",
    inputSchema: {
      fileId: z.string().describe("File ID to check sharing for")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId }) => {
    try {
      const [fileMeta, perms] = await Promise.all([
        drive.files.get({ fileId, fields: "id,name,mimeType,shared,webViewLink", supportsAllDrives: true }),
        drive.permissions.list({ fileId, supportsAllDrives: true, fields: "permissions(id,type,role,emailAddress,domain,displayName)" })
      ]);
      return okText({
        file: fileMeta.data,
        permissions: perms.data.permissions,
        totalPermissions: (perms.data.permissions || []).length
      });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_find_duplicates", {
    title: "Find Duplicate Files",
    description: "Find files with the same name in a folder or across Drive.",
    inputSchema: {
      name: z.string().describe("File name to search for duplicates"),
      folderId: z.string().optional().describe("Restrict search to this folder ID"),
      includeSharedDrives: z.boolean().default(true)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ name, folderId, includeSharedDrives }) => {
    try {
      const parts = [`name='${name.replace(/'/g, "\\'")}'`, "trashed=false"];
      if (folderId) parts.push(`'${folderId}' in parents`);
      const res = await drive.files.list({
        q: parts.join(" and "),
        pageSize: 100,
        supportsAllDrives: includeSharedDrives,
        includeItemsFromAllDrives: includeSharedDrives,
        fields: "files(id,name,mimeType,size,modifiedTime,parents,webViewLink,owners,createdTime)"
      });
      return okText({ name, duplicates: res.data.files, count: (res.data.files || []).length });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_file_tree", {
    title: "Get Folder Tree",
    description: "Recursively list the folder tree structure up to a given depth.",
    inputSchema: {
      folderId: z.string().default("root").describe("Root folder ID (default: 'root')"),
      maxDepth: z.number().int().min(1).max(5).default(2).describe("Maximum recursion depth (1-5)"),
      includeFiles: z.boolean().default(true).describe("Include files in the tree (not just folders)")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ folderId, maxDepth, includeFiles }) => {
    try {
      async function buildTree(parentId: string, depth: number): Promise<unknown[]> {
        if (depth > maxDepth) return [];
        const q = includeFiles
          ? `'${parentId}' in parents and trashed=false`
          : `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const res = await drive.files.list({
          q, pageSize: 200, orderBy: "folder,name",
          supportsAllDrives: true, includeItemsFromAllDrives: true,
          fields: "files(id,name,mimeType,size)"
        });
        const items = res.data.files || [];
        const results = [];
        for (const item of items) {
          const isFolder = item.mimeType === "application/vnd.google-apps.folder";
          const node: Record<string, unknown> = { id: item.id, name: item.name, mimeType: item.mimeType };
          if (!isFolder && item.size) node.size = item.size;
          if (isFolder && depth < maxDepth) {
            node.children = await buildTree(item.id!, depth + 1);
          }
          results.push(node);
        }
        return results;
      }
      const tree = await buildTree(folderId, 1);
      return okText({ folderId, maxDepth, tree });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
