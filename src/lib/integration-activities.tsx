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
  Sparkles,
  ShoppingBag,
} from "lucide-react";
import type { ToolIntegration } from "./agent-capabilities";

export const INTEGRATION_STYLES: Record<
  ToolIntegration,
  { name: string; color: string; icon: React.ReactNode }
> = {
  twilio: { name: "Twilio", color: "#F22F46", icon: <MessageSquare className="w-4 h-4" /> },
  calendar: { name: "Cal.com", color: "#111827", icon: <Calendar className="w-4 h-4" /> },
  crm: { name: "HubSpot", color: "#FF7A59", icon: <Users className="w-4 h-4" /> },
  slack: { name: "Slack", color: "#4A154B", icon: <MessagesSquare className="w-4 h-4" /> },
  zoom: { name: "Zoom", color: "#2D8CFF", icon: <Video className="w-4 h-4" /> },
  docusign: { name: "DocuSign", color: "#005CB9", icon: <FileSignature className="w-4 h-4" /> },
  apollo: { name: "Apollo", color: "#000000", icon: <Database className="w-4 h-4" /> },
  meta: { name: "Meta", color: "#0668E1", icon: <Plug className="w-4 h-4" /> },
  gemini: { name: "Gemini", color: "#1A73E8", icon: <Sparkles className="w-4 h-4" /> },
  shopify: { name: "Shopify", color: "#95BF47", icon: <ShoppingBag className="w-4 h-4" /> },
};
