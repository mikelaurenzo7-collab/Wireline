/* eslint-disable @typescript-eslint/no-explicit-any -- recipe payloads bridge several legacy agent APIs that still return loosely typed JSON. */
/**
 * Claude Recipes — shared types + metadata.
 *
 * Single source of truth for the Recipe enum and per-recipe metadata
 * (title, tagline, icon, accent, "thinking" flag). Imported by the
 * button, modal, and every recipe form.
 */

import {
  Compass,
  Search,
  Target,
  ShieldAlert,
  Mail,
  Wand2,
  ScrollText,
  BarChart3,
  Headphones,
  Globe,
  FileUp,
  Hammer,
} from "lucide-react";

export type Recipe =
  | "brief"
  | "enrich-lead"
  | "qualify"
  | "objection-drill"
  | "cold-email"
  | "persona-clone"
  | "summarize-thread"
  | "agent-review"
  | "coach"
  | "knowledge-from-url"
  | "knowledge-from-document"
  | "agent-forge"
  | "call-playbook";

export interface RecipeMeta {
  title: string;
  tagline: string;
  icon: any;
  accent: string;
  thinking: boolean;
}

export const RECIPE_META: Record<Recipe, RecipeMeta> = {
  brief: {
    title: "Pre-Call Brief",
    tagline: "Tactical playbook before you dial.",
    icon: Compass,
    accent: "#4F1E7B",
    thinking: true,
  },
  "enrich-lead": {
    title: "Enrich Lead",
    tagline: "Wireline AI searches the web — identity, employer, hooks.",
    icon: Search,
    accent: "#6B2B99",
    thinking: false,
  },
  qualify: {
    title: "Lead Qualification",
    tagline: "BANT-scored evidence, not vibes.",
    icon: Target,
    accent: "#4F1E7B",
    thinking: true,
  },
  "objection-drill": {
    title: "Objection Drills",
    tagline: "Realistic scenarios with scripted rebuttals.",
    icon: ShieldAlert,
    accent: "#4F1E7B",
    thinking: false,
  },
  "cold-email": {
    title: "Cold Email",
    tagline: "Reply-worthy outreach in 120 words.",
    icon: Mail,
    accent: "#6B2B99",
    thinking: false,
  },
  "persona-clone": {
    title: "Persona Clone",
    tagline: "Distill a person's voice from samples.",
    icon: Wand2,
    accent: "#C4B5A0",
    thinking: true,
  },
  "summarize-thread": {
    title: "Thread Summary",
    tagline: "Action items + sentiment in one sweep.",
    icon: ScrollText,
    accent: "#4F1E7B",
    thinking: false,
  },
  "agent-review": {
    title: "Performance Review",
    tagline: "Deep audit of your last N calls.",
    icon: BarChart3,
    accent: "#4F1E7B",
    thinking: true,
  },
  coach: {
    title: "Live Call Coach",
    tagline: "Real-time take on a transcript — what to say next.",
    icon: Headphones,
    accent: "#4F1E7B",
    thinking: false,
  },
  "knowledge-from-url": {
    title: "Ingest from URL",
    tagline: "Wireline AI reads your site and extracts agent facts.",
    icon: Globe,
    accent: "#4F1E7B",
    thinking: false,
  },
  "knowledge-from-document": {
    title: "Ingest from PDF",
    tagline: "Upload a brochure, menu, or policy doc — Wireline AI reads it.",
    icon: FileUp,
    accent: "#C4B5A0",
    thinking: false,
  },
  "agent-forge": {
    title: "Agent Forge",
    tagline: "Synthesize a complete agent from a goal.",
    icon: Hammer,
    accent: "#6B2B99",
    thinking: true,
  },
  "call-playbook": {
    title: "Call Playbook",
    tagline: "Full script — opener, discovery, objections, close, voicemail.",
    icon: ScrollText,
    accent: "#C4B5A0",
    thinking: true,
  },
};

export interface AgentLite {
  id: string;
  name: string;
  archetype: string;
}
