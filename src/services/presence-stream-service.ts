import { Response } from "express";
import { sql, eq } from "drizzle-orm";
import pkg from "pg";
const { Client } = pkg;

import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";

class PresenceStreamManager {
  private clients = new Map<string, Set<Response>>();

  /**
   * Register a new express response SSE stream for a tenant user.
   */
  register(userId: string, res: Response) {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(res);
    log.info("SSE Presence client registered", {
      userId,
      activeConnections: this.clients.get(userId)!.size,
    });
  }

  /**
   * Unregister an express response SSE stream on request closure.
   */
  unregister(userId: string, res: Response) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      log.info("SSE Presence client unregistered", { userId, activeConnections: userClients.size });
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  /**
   * Broadcast presence data in real-time to all connected user streams.
   */
  broadcast(userId: string, data: any) {
    const userClients = this.clients.get(userId);
    if (userClients && userClients.size > 0) {
      const payload = `data: ${JSON.stringify(data)}\n\n`;
      for (const client of userClients) {
        try {
          client.write(payload);
        } catch (error: any) {
          log.warn("Failed to write to client socket, unregistering", {
            userId,
            error: error.message,
          });
          this.unregister(userId, client);
        }
      }
    }
  }
}

export const presenceStreams = new PresenceStreamManager();

/**
 * Initialize Postgres triggers on the database and connect a dedicated
 * pg client listener to LISTEN for presence_change notifications.
 */
export async function initPresenceDbListener() {
  if (process.env.VERCEL === "1") {
    // Vercel serverless functions are stateless and transient — do not start persistent listeners.
    return;
  }

  try {
    // 1. Create SQL notify trigger function
    await drizzle.execute(sql`
      CREATE OR REPLACE FUNCTION notify_presence_change()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify(
          'presence_change',
          json_build_object(
            'userId', COALESCE(NEW.user_id, OLD.user_id),
            'action', TG_OP
          )::text
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Drop existing and bind new trigger on the wireline_signal_presence table
    await drizzle.execute(sql`
      DROP TRIGGER IF EXISTS trigger_presence_change ON wireline_signal_presence;
    `);

    await drizzle.execute(sql`
      CREATE TRIGGER trigger_presence_change
      AFTER INSERT OR UPDATE OR DELETE ON wireline_signal_presence
      FOR EACH ROW
      EXECUTE FUNCTION notify_presence_change();
    `);

    log.info("Postgres presence triggers initialized successfully");

    // 3. Connect dedicated pg client to LISTEN for notifications
    const client = new Client({ connectionString: process.env.POSTGRES_URL });
    await client.connect();
    await client.query("LISTEN presence_change");

    client.on("notification", async (msg: any) => {
      try {
        if (!msg.payload) return;
        const payload = JSON.parse(msg.payload);
        const userId = payload.userId;
        if (!userId) return;

        // Fetch current presence list for the user who was modified
        const signals = await drizzle
          .select()
          .from(schema.signalPresence)
          .where(eq(schema.signalPresence.userId, userId));

        // Broadcast to all active streams connected under this userId
        presenceStreams.broadcast(userId, { type: "presence", signals });
      } catch (err: any) {
        log.error("Failed processing presence DB change notification", { error: err.message });
      }
    });

    client.on("error", (err: any) => {
      log.error("Presence Postgres listener encountered an error — reconnecting", {
        error: err.message,
      });
      // Schedule reconnection loop
      setTimeout(initPresenceDbListener, 5000);
    });
  } catch (error: any) {
    log.error("Failed to initialize postgres triggers/listeners", { error: error.message });
  }
}
