import type { Response } from "express";

type ClientIdentifier = {
  id: string;
  res: Response;
  /** Always derived from the authenticated request. */
  tenantId: string;
};

class SSEBroadcaster {
  private clients: ClientIdentifier[] = [];

  addClient(clientId: string, res: Response, tenantId: string) {
    const newClient: ClientIdentifier = { id: clientId, res, tenantId };
    this.clients.push(newClient);

    res.on("close", () => {
      this.removeClient(clientId);
    });
  }

  removeClient(clientId: string) {
    this.clients = this.clients.filter((client) => client.id !== clientId);
  }

  broadcast(event: string, data: unknown, tenantId?: string) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    this.clients.forEach((client) => {
      // Tenant-scoped events may only reach the exact authenticated tenant.
      // Unscoped events intentionally remain available to authenticated clients.
      if (tenantId && client.tenantId !== tenantId) return;
      try {
        client.res.write(payload);
      } catch (err) {
        console.error(`Failed to broadcast to client ${client.id}:`, err);
        this.removeClient(client.id);
      }
    });
  }
}

export const sseBroadcaster = new SSEBroadcaster();
