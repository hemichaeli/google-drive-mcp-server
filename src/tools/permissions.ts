import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

const PERMISSION_FIELDS = "id,type,role,emailAddress,domain,displayName,allowFileDiscovery,expirationTime";

export function registerPermissionTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_list_permissions", {
    title: "List File Permissions",
    description: "List all sharing permissions on a file or folder.",
    inputSchema: {
      fileId: z.string().describe("File or folder ID"),
      pageSize: z.number().int().min(1).max(100).default(100),
      pageToken: z.string().optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, pageSize, pageToken }) => {
    try {
      const res = await drive.permissions.list({ fileId, pageSize, pageToken, supportsAllDrives: true, fields: `nextPageToken,permissions(${PERMISSION_FIELDS})` });
      return okText({ permissions: res.data.permissions, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_permission", {
    title: "Get Permission",
    description: "Get details of a specific permission on a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      permissionId: z.string().describe("Permission ID")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, permissionId }) => {
    try {
      const res = await drive.permissions.get({ fileId, permissionId, supportsAllDrives: true, fields: PERMISSION_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_permission", {
    title: "Share File / Create Permission",
    description: "Share a file or folder with a user, group, domain, or make it public.",
    inputSchema: {
      fileId: z.string().describe("File or folder ID to share"),
      role: z.enum(["reader", "commenter", "writer", "fileOrganizer", "organizer", "owner"]).describe("Permission role"),
      type: z.enum(["user", "group", "domain", "anyone"]).describe("Grantee type"),
      emailAddress: z.string().optional().describe("Email for user/group type"),
      domain: z.string().optional().describe("Domain for domain type"),
      allowFileDiscovery: z.boolean().optional().describe("Allow file to appear in search for anyone/domain types"),
      expirationTime: z.string().optional().describe("ISO 8601 expiration time for the permission"),
      sendNotificationEmail: z.boolean().default(true).describe("Send notification email to grantee"),
      emailMessage: z.string().optional().describe("Custom message in notification email"),
      transferOwnership: z.boolean().default(false).describe("Transfer ownership (use with role=owner)")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ fileId, role, type, emailAddress, domain, allowFileDiscovery, expirationTime, sendNotificationEmail, emailMessage, transferOwnership }) => {
    try {
      const requestBody: drive_v3.Schema$Permission = { role, type };
      if (emailAddress) requestBody.emailAddress = emailAddress;
      if (domain) requestBody.domain = domain;
      if (allowFileDiscovery !== undefined) requestBody.allowFileDiscovery = allowFileDiscovery;
      if (expirationTime) requestBody.expirationTime = expirationTime;
      const res = await drive.permissions.create({ fileId, requestBody, sendNotificationEmail, emailMessage, transferOwnership, supportsAllDrives: true, fields: PERMISSION_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_permission", {
    title: "Update Permission",
    description: "Change the role of an existing permission on a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      permissionId: z.string().describe("Permission ID to update"),
      role: z.enum(["reader", "commenter", "writer", "fileOrganizer", "organizer", "owner"]).describe("New role"),
      expirationTime: z.string().optional().describe("New ISO 8601 expiration time"),
      transferOwnership: z.boolean().default(false)
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ fileId, permissionId, role, expirationTime, transferOwnership }) => {
    try {
      const requestBody: drive_v3.Schema$Permission = { role };
      if (expirationTime) requestBody.expirationTime = expirationTime;
      const res = await drive.permissions.update({ fileId, permissionId, requestBody, transferOwnership, supportsAllDrives: true, fields: PERMISSION_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_permission", {
    title: "Delete Permission",
    description: "Remove a sharing permission from a file or folder.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      permissionId: z.string().describe("Permission ID to remove")
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  }, async ({ fileId, permissionId }) => {
    try {
      await drive.permissions.delete({ fileId, permissionId, supportsAllDrives: true });
      return okText(`Permission ${permissionId} removed from file ${fileId}.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
