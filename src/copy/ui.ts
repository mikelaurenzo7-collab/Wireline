export const uiCopy = {
  product: {
    eyebrow: "V1 · Beta",
    headline: "Create. Train. Run the line.",
  },
  nav: {
    overview: "Overview",
    studio: "Studio",
    knowledge: "Knowledge",
    templates: "Templates",
    showcase: "Showcase",
    inbox: "Inbox",
    callLogs: "Call logs",
    connections: "Connections",
    settings: "Settings",
  },
  actions: {
    seeExamples: "See examples",
    useTemplate: "Use template",
    signOut: "Sign out",
    signingOut: "Signing out…",
    saveChanges: "Save changes",
    addSource: "Add source",
    connect: "Connect",
  },
  states: {
    activeLine: "Active line",
    training: "Training",
    voiceSet: "Voice set",
    notSet: "Not set",
    syncing: "Syncing…",
  },
} as const;

export type WirelineNavKey = keyof typeof uiCopy.nav;
export type WirelineActionKey = keyof typeof uiCopy.actions;
export type WirelineStateKey = keyof typeof uiCopy.states;
