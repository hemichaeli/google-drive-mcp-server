import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

export function registerFolderTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_create_folder", {
    title: "Create Folder",
    description: "Create a new folder in Google Drive.",
    inputSchema: {
      name: z.string().describe("Folder name"),
      parentId: z.string().optional().describe("Parent folder ID (defaults to root)"),
      description: z.string().optional().describe("Folder description"),
      driveId: z.string().optional().describe("Shared drive ID to create folder in")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, parentId, description, driveId }) => {
    try {
      const metadata: drive_v3.Schema$File = { name, mimeType: "application/vnd.google-apps.folder", description };
      if (parentId) metadata.parents = [parentId];
      else if (driveId) metadata.parents = [driveId];
      const res = await drive.files.create({ requestBody: metadata, supportsAllDrives: true, fields: "id,name,mimeType,parents,webViewLink,createdTime" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_list_folder_contents", {
    title: "List Folder Contents",
    description: "List all files and subfolders inside a specific folder.",
    inputSchema: {
      folderId: z.string().describe("Folder ID to list contents of (use 'root' for My Drive root)"),
      pageSize: z.number().int().min(1).max(1000).default(100).describe("Items per page"),
      pageToken: z.string().optional().describe("Pagination token"),
      includeSharedDrives: z.boolean().default(false)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ folderId, pageSize, pageToken, includeSharedDrives }) => {
    try {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        pageSize, pageToken,
        supportsAllDrives: includeSharedDrives,
        includeItemsFromAllDrives: includeSharedDrives,
        orderBy: "folder,name",
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,shared)"
      });
      return okText({ files: res.data.files, nextPageToken: res.data.nextPageToken, folderId });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_folder_path", {
    title: "Get Folder Path",
    description: "Resolve the full path of a folder by traversing parent IDs.",
    inputSchema: { fileId: z.string().describe("File or folder ID to get path for") },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId }) => {
    try {
      const path: string[] = [];
      let currentId = fileId;
      for (let i = 0; i < 20; i++) {
        const res = await drive.files.get({ fileId: currentId, fields: "id,name,parents", supportsAllDrives: true });
        path.unshift(res.data.name ?? currentId);
        if (!res.data.parents || res.data.parents.length === 0) break;
        currentId = res.data.parents[0];
      }
      return okText({ fileId, path: path.join("/"), segments: path });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
