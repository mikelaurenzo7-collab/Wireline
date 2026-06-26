import React from "react";
import {
  Plug,
  Calendar,
  Users,
  MessageSquare,
  Video,
  FileSignature,
  Database,
  MessagesSquare,
  ShoppingBag,
  CreditCard,
  FileSpreadsheet,
  Table,
} from "lucide-react";
import type { ToolIntegration } from "./agent-capabilities";

const monoAccent = "#111111";

export const INTEGRATION_STYLES: Record<
  ToolIntegration,
  { name: string; color: string; icon: React.ReactNode }
> = {
  twilio: { name: "Twilio", color: monoAccent, icon: <MessageSquare className="w-4 h-4" /> },
  calendar: { name: "Cal.com", color: monoAccent, icon: <Calendar className="w-4 h-4" /> },
  crm: { name: "HubSpot", color: monoAccent, icon: <Users className="w-4 h-4" /> },
  slack: { name: "Slack", color: monoAccent, icon: <MessagesSquare className="w-4 h-4" /> },
  x: {
    name: "X",
    color: monoAccent,
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  zoom: { name: "Zoom", color: monoAccent, icon: <Video className="w-4 h-4" /> },
  docusign: { name: "DocuSign", color: monoAccent, icon: <FileSignature className="w-4 h-4" /> },
  apollo: { name: "Apollo", color: monoAccent, icon: <Database className="w-4 h-4" /> },
  meta: { name: "Meta", color: monoAccent, icon: <Plug className="w-4 h-4" /> },
  shopify: { name: "Shopify", color: monoAccent, icon: <ShoppingBag className="w-4 h-4" /> },
  square: { name: "Square", color: monoAccent, icon: <CreditCard className="w-4 h-4" /> },
  microsoft_teams: { name: "MS Teams", color: monoAccent, icon: <Users className="w-4 h-4" /> },
  microsoft_excel: {
    name: "Excel",
    color: monoAccent,
    icon: <FileSpreadsheet className="w-4 h-4" />,
  },
  google_sheets: { name: "Sheets", color: monoAccent, icon: <Table className="w-4 h-4" /> },
};
