import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { drive_v3 } from "@googleapis/drive";
import { formatError, okText } from "../auth.js";

type DriveClient = drive_v3.Drive;

const COMMENT_FIELDS = "id,content,author,createdTime,modifiedTime,resolved,deleted,replies";

export function registerCommentTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_list_comments", {
    title: "List Comments",
    description: "List all comments on a Google Drive file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      includeDeleted: z.boolean().default(false).describe("Include deleted comments"),
      pageSize: z.number().int().min(1).max(100).default(50),
      pageToken: z.string().optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, includeDeleted, pageSize, pageToken }) => {
    try {
      const res = await drive.comments.list({ fileId, includeDeleted, pageSize, pageToken, fields: `nextPageToken,comments(${COMMENT_FIELDS})` });
      return okText({ comments: res.data.comments, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_comment", {
    title: "Get Comment",
    description: "Get a specific comment on a file by ID.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID"),
      includeDeleted: z.boolean().default(false)
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, commentId, includeDeleted }) => {
    try {
      const res = await drive.comments.get({ fileId, commentId, includeDeleted, fields: COMMENT_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_comment", {
    title: "Create Comment",
    description: "Add a new comment to a Google Drive file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      content: z.string().describe("Comment text content")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ fileId, content }) => {
    try {
      const res = await drive.comments.create({ fileId, requestBody: { content }, fields: COMMENT_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_comment", {
    title: "Update Comment",
    description: "Update the content of an existing comment.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID"),
      content: z.string().describe("New comment text")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  }, async ({ fileId, commentId, content }) => {
    try {
      const res = await drive.comments.update({ fileId, commentId, requestBody: { content }, fields: COMMENT_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_comment", {
    title: "Delete Comment",
    description: "Delete a comment from a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID to delete")
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  }, async ({ fileId, commentId }) => {
    try {
      await drive.comments.delete({ fileId, commentId });
      return okText(`Comment ${commentId} deleted.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_list_replies", {
    title: "List Comment Replies",
    description: "List all replies to a comment on a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID"),
      includeDeleted: z.boolean().default(false),
      pageSize: z.number().int().min(1).max(100).default(50),
      pageToken: z.string().optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, commentId, includeDeleted, pageSize, pageToken }) => {
    try {
      const res = await drive.replies.list({ fileId, commentId, includeDeleted, pageSize, pageToken, fields: "nextPageToken,replies(id,content,author,createdTime,modifiedTime,deleted)" });
      return okText({ replies: res.data.replies, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_create_reply", {
    title: "Create Reply to Comment",
    description: "Add a reply to an existing comment on a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID to reply to"),
      content: z.string().describe("Reply text")
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  }, async ({ fileId, commentId, content }) => {
    try {
      const res = await drive.replies.create({ fileId, commentId, requestBody: { content }, fields: "id,content,author,createdTime" });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_reply", {
    title: "Delete Reply",
    description: "Delete a reply from a comment.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      commentId: z.string().describe("Comment ID"),
      replyId: z.string().describe("Reply ID to delete")
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
  }, async ({ fileId, commentId, replyId }) => {
    try {
      await drive.replies.delete({ fileId, commentId, replyId });
      return okText(`Reply ${replyId} deleted.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}

const REVISION_FIELDS = "id,mimeType,modifiedTime,keepForever,published,lastModifyingUser,size";

export function registerRevisionTools(server: McpServer, drive: DriveClient) {

  server.registerTool("gdrive_list_revisions", {
    title: "List File Revisions",
    description: "List all revisions (version history) of a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      pageSize: z.number().int().min(1).max(1000).default(100),
      pageToken: z.string().optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, pageSize, pageToken }) => {
    try {
      const res = await drive.revisions.list({ fileId, pageSize, pageToken, fields: `nextPageToken,revisions(${REVISION_FIELDS})` });
      return okText({ revisions: res.data.revisions, nextPageToken: res.data.nextPageToken });
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_get_revision", {
    title: "Get Revision",
    description: "Get metadata for a specific revision of a file.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      revisionId: z.string().describe("Revision ID")
    },
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async ({ fileId, revisionId }) => {
    try {
      const res = await drive.revisions.get({ fileId, revisionId, fields: REVISION_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_update_revision", {
    title: "Update Revision",
    description: "Update revision settings like keepForever or published status.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      revisionId: z.string().describe("Revision ID"),
      keepForever: z.boolean().optional().describe("Keep this revision forever (prevent auto-deletion)"),
      published: z.boolean().optional().describe("Publish this revision")
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }
  }, async ({ fileId, revisionId, keepForever, published }) => {
    try {
      const requestBody: drive_v3.Schema$Revision = {};
      if (keepForever !== undefined) requestBody.keepForever = keepForever;
      if (published !== undefined) requestBody.published = published;
      const res = await drive.revisions.update({ fileId, revisionId, requestBody, fields: REVISION_FIELDS });
      return okText(res.data);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });

  server.registerTool("gdrive_delete_revision", {
    title: "Delete Revision",
    description: "Delete a specific revision of a file. Only revisions without keepForever=true can be deleted.",
    inputSchema: {
      fileId: z.string().describe("File ID"),
      revisionId: z.string().describe("Revision ID to delete")
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
  }, async ({ fileId, revisionId }) => {
    try {
      await drive.revisions.delete({ fileId, revisionId });
      return okText(`Revision ${revisionId} deleted from file ${fileId}.`);
    } catch (e) { return okText(`Error: ${formatError(e)}`); }
  });
}
