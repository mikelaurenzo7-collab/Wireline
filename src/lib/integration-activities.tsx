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

export const INTEGRATION_STYLES: Record<
  ToolIntegration,
  { name: string; color: string; icon: React.ReactNode }
> = {
  twilio: { name: "Twilio", color: "#F22F46", icon: <MessageSquare className="w-4 h-4" /> },
  calendar: { name: "Cal.com", color: "#1C1C1A", icon: <Calendar className="w-4 h-4" /> },
  crm: { name: "HubSpot", color: "#FF7A59", icon: <Users className="w-4 h-4" /> },
  slack: { name: "Slack", color: "#4A154B", icon: <MessagesSquare className="w-4 h-4" /> },
  x: {
    name: "X",
    color: "#1C1C1A",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  zoom: { name: "Zoom", color: "#2D8CFF", icon: <Video className="w-4 h-4" /> },
  docusign: { name: "DocuSign", color: "#005CB9", icon: <FileSignature className="w-4 h-4" /> },
  apollo: { name: "Apollo", color: "#1C1C1A", icon: <Database className="w-4 h-4" /> },
  meta: { name: "Meta", color: "#0668E1", icon: <Plug className="w-4 h-4" /> },
  shopify: { name: "Shopify", color: "#95BF47", icon: <ShoppingBag className="w-4 h-4" /> },
  square: { name: "Square", color: "#006AFF", icon: <CreditCard className="w-4 h-4" /> },
  microsoft_teams: { name: "MS Teams", color: "#6264A7", icon: <Users className="w-4 h-4" /> },
  microsoft_excel: {
    name: "Excel",
    color: "#217346",
    icon: <FileSpreadsheet className="w-4 h-4" />,
  },
  google_sheets: { name: "Sheets", color: "#34A853", icon: <Table className="w-4 h-4" /> },
};
