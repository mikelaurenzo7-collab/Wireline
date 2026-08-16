/* eslint-disable @typescript-eslint/no-explicit-any -- Postgres LISTEN/NOTIFY
 * payloads arrive as untyped JSON strings from the pg driver, and Express
 * SSE write errors / pg client errors surface as Error-ish objects without a
 * shared interface. The catch blocks below all access `.message` defensively
 * so a future tightening to `unknown` is mechanical. */
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
 * Initialize Postgres triggers on the database.
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
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $$
      BEGIN
        PERFORM pg_notify(
          'presence_change',
          json_build_object(
            'userId', COALESCE(NEW.user_id, OLD.user_id),
            'action', TG_OP
          )::text
        );
        RETURN COALESCE(NEW, OLD);
      END;
      $$;
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
  } catch (error: any) {
    log.error("Failed to initialize postgres triggers", { error: error.message });
  }
}

/**
 * Connect dedicated pg client to LISTEN for notifications.
 * Self-healing reconnection loop.
 */
export async function startPresenceListener() {
  if (process.env.VERCEL === "1") return;

  const client = new Client({ connectionString: process.env.POSTGRES_URL });

  try {
    await client.connect();
    await client.query("LISTEN presence_change");
    log.info("Postgres presence listener connected successfully");

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
      log.error("Presence Postgres listener encountered an error, reconnecting", {
        error: err.message,
      });
      // Clean up the client to prevent socket/connection leaks
      client
        .end()
        .catch((e: any) => log.warn("Failed to end PG client on error", { error: e.message }));
      // Schedule reconnection loop
      setTimeout(startPresenceListener, 5000);
    });
  } catch (error: any) {
    log.warn("Failed to connect presence pg listener, retrying in 5s", { error: error.message });
    // Clean up if connect failed
    client.end().catch(() => {});
    setTimeout(startPresenceListener, 5000);
  }
}
