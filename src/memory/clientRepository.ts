import type { DatabaseSync } from "node:sqlite";
import type { Client } from "../types.ts";

type ClientRow = {
  id: string;
  name: string;
  segment: string;
  contact_name: string;
  contact_role: string;
  customer_since: string;
};

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    contactName: row.contact_name,
    contactRole: row.contact_role,
    customerSince: row.customer_since,
  };
}

export class ClientRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  upsert(client: Client): void {
    this.db
      .prepare(
        `INSERT INTO clients (id, name, segment, contact_name, contact_role, customer_since)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, segment = excluded.segment, contact_name = excluded.contact_name,
           contact_role = excluded.contact_role, customer_since = excluded.customer_since`,
      )
      .run(client.id, client.name, client.segment, client.contactName, client.contactRole, client.customerSince);
  }

  list(): Client[] {
    const rows = this.db.prepare("SELECT * FROM clients ORDER BY name").all() as ClientRow[];
    return rows.map(toClient);
  }

  find(id: string): Client | undefined {
    const row = this.db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as ClientRow | undefined;
    return row ? toClient(row) : undefined;
  }
}
