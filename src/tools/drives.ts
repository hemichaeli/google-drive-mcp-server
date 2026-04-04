import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

const DRIVE_FIELDS = "id,name,kind,createdTime,hidden,capabilities,restrictions,backgroundImageFile";

export function registerDriveTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_list_shared_drives", {
    title: "List Shared Drives",
    description: "List all shared drives the user has access to.",
    inputSchema: {
      pageSize: z.number().int().min(1).max(100).default(100),
      pageToken: z.string().optional(),
      useDomainAdminAccess: z.boolean().default(false)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ pageSize, pageToken, useDomainAdminAccess }) => {
    try {
      const res = await drive.drives.list({ pageSize, pageToken, useDomainAdminAccess, fields: `nextPageToken,drives(${DRIVE_FIELDS})` });
      return okText({ drives: res.data.drives, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_shared_drive", {
    title: "Get Shared Drive",
    description: "Get information about a specific shared drive.",
    inputSchema: {
      driveId: z.string().describe("Shared drive ID"),
      useDomainAdminAccess: z.boolean().default(false)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ driveId, useDomainAdminAccess }) => {
    try {
      const res = await drive.drives.get({ driveId, useDomainAdminAccess, fields: DRIVE_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_shared_drive", {
    title: "Create Shared Drive",
    description: "Create a new shared drive.",
    inputSchema: {
      name: z.string().describe("Name for the new shared drive"),
      requestId: z.string().optional().describe("Unique request ID for idempotency (UUID recommended)")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ name, requestId }) => {
    try {
      const reqId = requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const res = await drive.drives.create({ requestId: reqId, requestBody: { name }, fields: DRIVE_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_shared_drive", {
    title: "Update Shared Drive",
    description: "Update a shared drive name or restrictions.",
    inputSchema: {
      driveId: z.string().describe("Shared drive ID"),
      name: z.string().optional().describe("New name"),
      useDomainAdminAccess: z.boolean().default(false)
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ driveId, name, useDomainAdminAccess }) => {
    try {
      const requestBody: drive_v3.Schema$Drive = {};
      if (name) requestBody.name = name;
      const res = await drive.drives.update({ driveId, requestBody, useDomainAdminAccess, fields: DRIVE_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_shared_drive", {
    title: "Delete Shared Drive",
    description: "Delete an empty shared drive. The drive must have no files.",
    inputSchema: {
      driveId: z.string().describe("Shared drive ID to delete"),
      useDomainAdminAccess: z.boolean().default(false)
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async ({ driveId, useDomainAdminAccess }) => {
    try {
      await drive.drives.delete({ driveId, useDomainAdminAccess });
      return okText(`Shared drive ${driveId} deleted.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_hide_shared_drive", {
    title: "Hide Shared Drive",
    description: "Hide a shared drive from the default list.",
    inputSchema: { driveId: z.string().describe("Shared drive ID to hide") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ driveId }) => {
    try {
      const res = await drive.drives.hide({ driveId, fields: DRIVE_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_unhide_shared_drive", {
    title: "Unhide Shared Drive",
    description: "Show a previously hidden shared drive.",
    inputSchema: { driveId: z.string().describe("Shared drive ID to unhide") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ driveId }) => {
    try {
      const res = await drive.drives.unhide({ driveId, fields: DRIVE_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}

export function registerAboutTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_get_about", {
    title: "Get Drive Info",
    description: "Get information about the current user and their Drive storage quota.",
    inputSchema: {
      fields: z.string().default("user,storageQuota,appInstalled,importFormats,exportFormats,maxImportSizes,maxUploadSize").describe("Fields to return")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fields }) => {
    try {
      const res = await drive.about.get({ fields });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}

export function registerChannelTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_stop_channel", {
    title: "Stop Watch Channel",
    description: "Stop a push notification channel that was previously started.",
    inputSchema: {
      channelId: z.string().describe("Channel ID to stop"),
      resourceId: z.string().describe("Resource ID associated with the channel")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ channelId, resourceId }) => {
    try {
      await drive.channels.stop({ requestBody: { id: channelId, resourceId } });
      return okText(`Channel ${channelId} stopped.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
