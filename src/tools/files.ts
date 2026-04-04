import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

export function registerFileTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_list_files", {
    title: "List Drive Files",
    description: "List files in Google Drive with optional filters. Supports pagination, MIME type filtering, and folder scoping.",
    inputSchema: {
      query: z.string().optional().describe("Google Drive query string (e.g. \"name contains 'report'\")"),
      folderId: z.string().optional().describe("Limit results to files inside this folder ID"),
      mimeType: z.string().optional().describe("Filter by MIME type (e.g. 'application/vnd.google-apps.document')"),
      pageSize: z.number().int().min(1).max(1000).default(50).describe("Number of files per page (default 50)"),
      pageToken: z.string().optional().describe("Token for next page from a previous list call"),
      orderBy: z.string().optional().describe("Sort order (e.g. 'name', 'modifiedTime desc')"),
      includeSharedDrives: z.boolean().default(false).describe("Include files from shared drives"),
      driveId: z.string().optional().describe("Shared drive ID to list files from"),
      trashed: z.boolean().default(false).describe("Show trashed files only")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ query, folderId, mimeType, pageSize, pageToken, orderBy, includeSharedDrives, driveId, trashed }) => {
    try {
      const parts: string[] = [];
      if (folderId) parts.push(`'${folderId}' in parents`);
      if (mimeType) parts.push(`mimeType='${mimeType}'`);
      parts.push(`trashed=${trashed}`);
      if (query) parts.push(query);
      const q = parts.join(" and ");
      const params: drive_v3.Params$Resource$Files$List = {
        q, pageSize, pageToken, orderBy,
        supportsAllDrives: includeSharedDrives,
        includeItemsFromAllDrives: includeSharedDrives,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,iconLink,shared,starred,trashed,owners,lastModifyingUser)"
      };
      if (driveId) { params.driveId = driveId; params.corpora = "drive"; }
      const res = await drive.files.list(params);
      return okText({ files: res.data.files, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_file", {
    title: "Get File Metadata",
    description: "Retrieve full metadata for a specific file by its ID.",
    inputSchema: {
      fileId: z.string().describe("Google Drive file ID"),
      fields: z.string().optional().default("*").describe("Fields to return (default: all)")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, fields }) => {
    try {
      const res = await drive.files.get({ fileId, fields, supportsAllDrives: true });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_search_files", {
    title: "Search Files",
    description: "Full-text search across files in Google Drive using Drive query language.",
    inputSchema: {
      query: z.string().describe("Search query (e.g. \"fullText contains 'budget'\")"),
      pageSize: z.number().int().min(1).max(1000).default(20).describe("Results per page"),
      pageToken: z.string().optional().describe("Pagination token"),
      includeSharedDrives: z.boolean().default(true)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ query, pageSize, pageToken, includeSharedDrives }) => {
    try {
      const res = await drive.files.list({
        q: query, pageSize, pageToken,
        supportsAllDrives: includeSharedDrives,
        includeItemsFromAllDrives: includeSharedDrives,
        fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents)"
      });
      return okText({ files: res.data.files, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_download_file", {
    title: "Download File Content",
    description: "Download the content of a binary/text file from Google Drive. For Google Docs/Sheets/Slides use gdrive_export_file instead.",
    inputSchema: {
      fileId: z.string().describe("Google Drive file ID"),
      encoding: z.enum(["utf8", "base64"]).default("utf8").describe("Response encoding (utf8 for text, base64 for binary)")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, encoding }) => {
    try {
      const res = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      const buf = Buffer.from(res.data as ArrayBuffer);
      const content = encoding === "base64" ? buf.toString("base64") : buf.toString("utf8");
      return okText({ content, encoding, size: buf.length });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_export_file", {
    title: "Export Google Workspace File",
    description: "Export Google Docs/Sheets/Slides to a different format (PDF, DOCX, XLSX, etc.).",
    inputSchema: {
      fileId: z.string().describe("Google Drive file ID"),
      mimeType: z.string().describe("Export MIME type (e.g. 'application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, mimeType }) => {
    try {
      const res = await drive.files.export({ fileId, mimeType }, { responseType: "arraybuffer" });
      const buf = Buffer.from(res.data as ArrayBuffer);
      const isText = mimeType.startsWith("text/");
      const content = isText ? buf.toString("utf8") : buf.toString("base64");
      return okText({ content, mimeType, encoding: isText ? "utf8" : "base64", size: buf.length });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_file", {
    title: "Create File",
    description: "Create a new file in Google Drive with optional text/base64 content.",
    inputSchema: {
      name: z.string().describe("File name"),
      mimeType: z.string().default("text/plain").describe("MIME type (e.g. 'text/plain', 'application/json')"),
      content: z.string().optional().describe("File content (text or base64)"),
      contentEncoding: z.enum(["utf8", "base64"]).default("utf8"),
      parentId: z.string().optional().describe("Parent folder ID (defaults to root)"),
      description: z.string().optional().describe("File description")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, mimeType, content, contentEncoding, parentId, description }) => {
    try {
      const metadata: drive_v3.Schema$File = { name, mimeType, description };
      if (parentId) metadata.parents = [parentId];
      let media: { mimeType: string; body: Buffer | string } | undefined;
      if (content) {
        const body = contentEncoding === "base64" ? Buffer.from(content, "base64") : content;
        media = { mimeType, body };
      }
      const res = await drive.files.create({ requestBody: { ...metadata }, media, supportsAllDrives: true, fields: "id,name,mimeType,webViewLink,parents,createdTime" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_google_doc", {
    title: "Create Google Doc",
    description: "Create a new blank Google Doc in Drive.",
    inputSchema: { name: z.string().describe("Document title"), parentId: z.string().optional().describe("Parent folder ID") },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, parentId }) => {
    try {
      const metadata: drive_v3.Schema$File = { name, mimeType: "application/vnd.google-apps.document" };
      if (parentId) metadata.parents = [parentId];
      const res = await drive.files.create({ requestBody: metadata, supportsAllDrives: true, fields: "id,name,mimeType,webViewLink" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_google_sheet", {
    title: "Create Google Sheet",
    description: "Create a new blank Google Spreadsheet in Drive.",
    inputSchema: { name: z.string().describe("Spreadsheet title"), parentId: z.string().optional().describe("Parent folder ID") },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, parentId }) => {
    try {
      const metadata: drive_v3.Schema$File = { name, mimeType: "application/vnd.google-apps.spreadsheet" };
      if (parentId) metadata.parents = [parentId];
      const res = await drive.files.create({ requestBody: metadata, supportsAllDrives: true, fields: "id,name,mimeType,webViewLink" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_google_slides", {
    title: "Create Google Slides",
    description: "Create a new blank Google Slides presentation in Drive.",
    inputSchema: { name: z.string().describe("Presentation title"), parentId: z.string().optional().describe("Parent folder ID") },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, parentId }) => {
    try {
      const metadata: drive_v3.Schema$File = { name, mimeType: "application/vnd.google-apps.presentation" };
      if (parentId) metadata.parents = [parentId];
      const res = await drive.files.create({ requestBody: metadata, supportsAllDrives: true, fields: "id,name,mimeType,webViewLink" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_file_metadata", {
    title: "Update File Metadata",
    description: "Update file name, description, or starred status.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      name: z.string().optional().describe("New file name"),
      description: z.string().optional().describe("New description"),
      starred: z.boolean().optional().describe("Star or unstar the file")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ fileId, name, description, starred }) => {
    try {
      const requestBody: drive_v3.Schema$File = {};
      if (name !== undefined) requestBody.name = name;
      if (description !== undefined) requestBody.description = description;
      if (starred !== undefined) requestBody.starred = starred;
      const res = await drive.files.update({ fileId, requestBody, supportsAllDrives: true, fields: "id,name,description,starred,modifiedTime" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_file_content", {
    title: "Update File Content",
    description: "Overwrite the content of an existing file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      content: z.string().describe("New file content"),
      mimeType: z.string().default("text/plain").describe("Content MIME type"),
      contentEncoding: z.enum(["utf8", "base64"]).default("utf8")
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async ({ fileId, content, mimeType, contentEncoding }) => {
    try {
      const body = contentEncoding === "base64" ? Buffer.from(content, "base64") : content;
      const res = await drive.files.update({ fileId, requestBody: {}, media: { mimeType, body }, supportsAllDrives: true, fields: "id,name,size,modifiedTime" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_copy_file", {
    title: "Copy File",
    description: "Create a copy of a file in Google Drive.",
    inputSchema: {
      fileId: z.string().describe("File ID to copy"),
      name: z.string().optional().describe("Name for the copy"),
      parentId: z.string().optional().describe("Destination folder ID")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ fileId, name, parentId }) => {
    try {
      const requestBody: drive_v3.Schema$File = {};
      if (name) requestBody.name = name;
      if (parentId) requestBody.parents = [parentId];
      const res = await drive.files.copy({ fileId, requestBody, supportsAllDrives: true, fields: "id,name,mimeType,webViewLink,parents" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_move_file", {
    title: "Move File",
    description: "Move a file to a different folder.",
    inputSchema: {
      fileId: z.string().describe("File ID to move"),
      newParentId: z.string().describe("Destination folder ID"),
      removeFromCurrentParents: z.boolean().default(true).describe("Remove from current parent folders")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ fileId, newParentId, removeFromCurrentParents }) => {
    try {
      const current = await drive.files.get({ fileId, fields: "parents", supportsAllDrives: true });
      const oldParents = removeFromCurrentParents ? (current.data.parents || []).join(",") : undefined;
      const res = await drive.files.update({ fileId, addParents: newParentId, removeParents: oldParents, requestBody: {}, supportsAllDrives: true, fields: "id,name,parents" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_trash_file", {
    title: "Trash File",
    description: "Move a file to the trash (recoverable).",
    inputSchema: { fileId: z.string().describe("File ID to trash") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  }, async ({ fileId }) => {
    try {
      const res = await drive.files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true, fields: "id,name,trashed" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_restore_file", {
    title: "Restore File from Trash",
    description: "Restore a trashed file back to Drive.",
    inputSchema: { fileId: z.string().describe("File ID to restore") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ fileId }) => {
    try {
      const res = await drive.files.update({ fileId, requestBody: { trashed: false }, supportsAllDrives: true, fields: "id,name,trashed" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_file", {
    title: "Permanently Delete File",
    description: "Permanently delete a file. IRREVERSIBLE. Use gdrive_trash_file for recoverable deletion.",
    inputSchema: { fileId: z.string().describe("File ID to permanently delete") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async ({ fileId }) => {
    try {
      await drive.files.delete({ fileId, supportsAllDrives: true });
      return okText(`File ${fileId} permanently deleted.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_empty_trash", {
    title: "Empty Trash",
    description: "Permanently delete all files in the user's trash. IRREVERSIBLE.",
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async () => {
    try {
      await drive.files.emptyTrash({});
      return okText("Trash emptied successfully.");
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_generate_ids", {
    title: "Generate File IDs",
    description: "Generate a set of file IDs that can be used in create requests.",
    inputSchema: { count: z.number().int().min(1).max(1000).default(10).describe("Number of IDs to generate") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async ({ count }) => {
    try {
      const res = await drive.files.generateIds({ count });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
