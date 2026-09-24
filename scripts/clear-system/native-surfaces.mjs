/**
 * Native Android, iOS, CarPlay, and widget contracts.
 *
 * Visible product language is Bot-native, the visible company name is BotBound,
 * and compact interface language is uppercase where it acts as a control label.
 * Technical classes, route keys, API methods, bundle identifiers, URL schemes,
 * and persisted records may retain agent/assistant/wireline identifiers for compatibility.
 */
export function checkNativeSurfaces({ read, mustInclude, mustExclude }) {
  const androidManifest = read("android/app/src/main/AndroidManifest.xml");
  const androidLauncherForeground = read(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
  );
  const androidApp = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
  const androidSetup = read("android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt");
  const androidStrings = read("android/app/src/main/res/values/strings.xml");
  const iosRootTabs = read("ios/Wireline/Views/RootTabView.swift");
  const iosSignIn = read("ios/Wireline/Views/SignInView.swift");
  const iosWorkspace = read("ios/Wireline/Views/WorkspaceView.swift");
  const iosBotLibrary = read("ios/Wireline/Views/AssistantLibraryView.swift");
  const iosKnowledgeConnections = read("ios/Wireline/Views/AssistantSetupViews.swift");
  const iosCarPlay = read("ios/Wireline/CarPlay/CarPlaySceneDelegate.swift");
  const iosInfo = read("ios/Wireline/Info.plist");
  const iosWidgetInfo = read("ios/WirelineWidgets/Info.plist");
  const iosBotWidget = read("ios/WirelineWidgets/AssistantWidget.swift");
  const androidBotWidget = read(
    "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
  );

  mustInclude(
    "android/app/src/main/res/values/strings.xml",
    androidStrings,
    /<string name="app_name">BotBound<\/string>/,
    "Android launcher display name must use BotBound",
  );
  mustInclude(
    "android/app/src/main/AndroidManifest.xml",
    androidManifest,
    /android:label="BotBound"/,
    "Android application label must use BotBound",
  );
  mustInclude(
    "android/app/src/main/AndroidManifest.xml",
    androidManifest,
    /android:label="Ask BotBound"/,
    "Android quick-action widget must use BotBound",
  );
  mustInclude(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    androidLauncherForeground,
    /BotBound Presenting app-tile foreground/,
    "Android adaptive icon must use the Presenting app tile",
  );
  mustExclude(
    "android/app/src/main/res/drawable/ic_launcher_foreground.xml",
    androidLauncherForeground,
    /folded Wireline W/,
    "retired folded-W launcher identity must not return",
  );

  for (const [pattern, description] of [
    [/object Studio : Screen\("studio", "OVERVIEW"\)/, "Android app must anchor on Overview"],
    [/object Assistants : Screen\("assistants", "BOTS"\)/, "Android app must use Bots"],
    [/object Knowledge : Screen\("knowledge", "KNOWLEDGE"\)/, "Android app must use Knowledge"],
    [/object Actions : Screen\("actions", "CONNECTIONS"\)/, "Android app must use Connections"],
    [/object Recaps : Screen\("recaps", "CALLS"\)/, "Android app must use Calls"],
    [
      /BOTS THAT GET THE WORK DONE/,
      "Android sign-in must retain the current native slogan until its next IA copy pass",
    ],
    [
      /Voice-first Bots for calls, live conversations, text, and email\./,
      "Android sign-in must state the current native channel promise",
    ],
    [/MetricStatCard\([^\n]*label = "BOTS"/, "Android overview must report Bots"],
    [/Text\("BOTS"/, "Android Bot library must use the customer-facing noun"],
  ]) {
    mustInclude(
      "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
      androidApp,
      pattern,
      description,
    );
  }

  for (const [pattern, description] of [
    [/title = \{ Text\("KNOWLEDGE"/, "Android knowledge page must use the canonical title"],
    [/title = \{ Text\("CONNECTIONS"/, "Android connections page must use the canonical title"],
    [/WHAT SHOULD YOUR BOT DO OR AVOID\?/, "Android knowledge editor must address the Bot"],
    [/WHAT YOUR BOT CAN DO/, "Android connections must describe Bot capabilities"],
  ]) {
    mustInclude(
      "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
      androidSetup,
      pattern,
      description,
    );
  }

  mustInclude(
    "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
    androidBotWidget,
    /BotBound Bots/,
    "Android widget must use BotBound identity",
  );

  mustInclude(
    "ios/Wireline/Info.plist",
    iosInfo,
    /<key>CFBundleDisplayName<\/key>\s*<string>BotBound<\/string>/,
    "iOS launcher display name must use BotBound",
  );
  for (const permission of [
    "NSMicrophoneUsageDescription",
    "NSCalendarsUsageDescription",
    "NSCalendarsWriteOnlyAccessUsageDescription",
    "NSSiriUsageDescription",
    "NSAppleMusicUsageDescription",
    "NSRemindersUsageDescription",
  ]) {
    mustInclude(
      "ios/Wireline/Info.plist",
      iosInfo,
      new RegExp(`<key>${permission}<\\/key>\\s*<string>BotBound\\b`),
      `${permission} must present the brand as BotBound`,
    );
  }
  mustInclude(
    "ios/WirelineWidgets/Info.plist",
    iosWidgetInfo,
    /<key>CFBundleDisplayName<\/key>\s*<string>BotBound<\/string>/,
    "iOS widget display name must use BotBound",
  );

  for (const [pattern, description] of [
    [
      /Label\("OVERVIEW", systemImage: "rectangle\.grid\.2x2"\)/,
      "iOS tab bar must anchor on Overview",
    ],
    [/Label\("BOTS", systemImage: "waveform\.and\.person\.filled"\)/, "iOS tab bar must use Bots"],
    [/Label\("KNOWLEDGE", systemImage: "book\.closed"\)/, "iOS tab bar must use Knowledge"],
    [/Label\("CONNECT", systemImage: "bolt"\)/, "iOS tab bar must expose Connections"],
    [/Label\("CALLS", systemImage: "phone\.connection"\)/, "iOS tab bar must use Calls"],
  ]) {
    mustInclude("ios/Wireline/Views/RootTabView.swift", iosRootTabs, pattern, description);
  }

  for (const [pattern, description] of [
    [/Text\("BotBound"\)/, "iOS sign-in must use the BotBound brand"],
    [/PUT YOUR BOT ON THE LINE/, "iOS sign-in must use the BotBound slogan"],
    [/Your Bot for calls, texts, and email\./, "iOS sign-in must use the unified BotBound promise"],
    [/Text\("SIGN IN"\)/, "iOS sign-in action must use uppercase control language"],
    [/Signs in to your BotBound account/, "iOS accessibility copy must use BotBound"],
  ]) {
    mustInclude("ios/Wireline/Views/SignInView.swift", iosSignIn, pattern, description);
  }

  for (const [file, source, pattern, description] of [
    [
      "ios/Wireline/Views/WorkspaceView.swift",
      iosWorkspace,
      /navigationTitle\("OVERVIEW"\)/,
      "iOS workspace must use Overview",
    ],
    [
      "ios/Wireline/Views/WorkspaceView.swift",
      iosWorkspace,
      /Metric\(title: "BOTS"/,
      "iOS workspace must report Bots",
    ],
    [
      "ios/Wireline/Views/WorkspaceView.swift",
      iosWorkspace,
      /Text\("BOTS"\)/,
      "iOS workspace roster must be Bots",
    ],
    [
      "ios/Wireline/Views/AssistantLibraryView.swift",
      iosBotLibrary,
      /navigationTitle\("BOTS"\)/,
      "iOS Bot library must use Bots",
    ],
    [
      "ios/Wireline/Views/AssistantLibraryView.swift",
      iosBotLibrary,
      /Label\("CREATE BOT"/,
      "iOS Bot creation must use the customer-facing noun",
    ],
    [
      "ios/Wireline/Views/AssistantSetupViews.swift",
      iosKnowledgeConnections,
      /navigationTitle\("KNOWLEDGE"\)/,
      "iOS setup must use Knowledge",
    ],
    [
      "ios/Wireline/Views/AssistantSetupViews.swift",
      iosKnowledgeConnections,
      /navigationTitle\("CONNECTIONS"\)/,
      "iOS actions must use Connections",
    ],
    [
      "ios/Wireline/Views/AssistantSetupViews.swift",
      iosKnowledgeConnections,
      /WAYS YOUR BOT CAN HELP/,
      "iOS connections must describe Bot capabilities",
    ],
    [
      "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
      iosCarPlay,
      /titleVariants: \["BOTS", "CHOOSE A BOT"\]/,
      "CarPlay must expose Bot selection",
    ],
    [
      "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
      iosCarPlay,
      /CPListTemplate\(title: "BOTS"/,
      "CarPlay Bot list must use Bots",
    ],
    [
      "ios/WirelineWidgets/AssistantWidget.swift",
      iosBotWidget,
      /configurationDisplayName\("BotBound Bots"\)/,
      "iOS widget gallery must use BotBound",
    ],
    [
      "ios/WirelineWidgets/AssistantWidget.swift",
      iosBotWidget,
      /description\("Open your BotBound Bots/,
      "iOS widget description must use BotBound",
    ],
    [
      "ios/WirelineWidgets/AssistantWidget.swift",
      iosBotWidget,
      /Text\("BotBound Bots"\)/,
      "iOS widget face must use BotBound identity",
    ],
    [
      "ios/WirelineWidgets/AssistantWidget.swift",
      iosBotWidget,
      /accessibilityLabel\("BotBound Bots\./,
      "iOS widget accessibility label must use BotBound",
    ],
  ]) {
    mustInclude(file, source, pattern, description);
  }

  mustExclude(
    "ios/Wireline/Info.plist",
    iosInfo,
    /Wireline Assistant|assistants/i,
    "iOS visible permission copy must not revive Assistant naming",
  );
  mustExclude(
    "ios/WirelineWidgets/Info.plist",
    iosWidgetInfo,
    /Wireline Assistant/i,
    "iOS widget display name must not revive Assistant naming",
  );

  for (const [file, source] of [
    ["android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt", androidApp],
    ["android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt", androidSetup],
    [
      "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
      androidBotWidget,
    ],
    ["ios/Wireline/Views/RootTabView.swift", iosRootTabs],
    ["ios/Wireline/Views/SignInView.swift", iosSignIn],
    ["ios/Wireline/Views/WorkspaceView.swift", iosWorkspace],
    ["ios/Wireline/Views/AssistantLibraryView.swift", iosBotLibrary],
    ["ios/Wireline/Views/AssistantSetupViews.swift", iosKnowledgeConnections],
    ["ios/Wireline/CarPlay/CarPlaySceneDelegate.swift", iosCarPlay],
    ["ios/WirelineWidgets/AssistantWidget.swift", iosBotWidget],
  ]) {
    mustExclude(
      file,
      source,
      /phone employees?|AI profit agent|Voice agents for appointments/i,
      "native surfaces must not carry retired product positioning",
    );
  }

  for (const [file, source, pattern] of [
    [
      "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
      androidApp,
      /Text\("AGENTS"\)|contentDescription = "AGENTS"/,
    ],
    [
      "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
      androidSetup,
      /YOUR AGENT|Create an agent|Start with an AI profit agent/i,
    ],
    [
      "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
      androidBotWidget,
      /Wireline Agents|Wireline Assistants/,
    ],
    ["ios/Wireline/Views/RootTabView.swift", iosRootTabs, /Label\("Agents"/],
    [
      "ios/Wireline/Views/WorkspaceView.swift",
      iosWorkspace,
      /Metric\(title: "Agents"|Text\("Agents"\)/,
    ],
    [
      "ios/Wireline/Views/AssistantLibraryView.swift",
      iosBotLibrary,
      /navigationTitle\("Agents"\)|Text\("Agent Name"\)/,
    ],
    [
      "ios/Wireline/Views/AssistantSetupViews.swift",
      iosKnowledgeConnections,
      /Picker\("Agent"|WAYS YOUR AGENT|Start with an AI profit agent/i,
    ],
    [
      "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
      iosCarPlay,
      /titleVariants: \["Agents"|CPListTemplate\(title: "Agents"/,
    ],
    [
      "ios/WirelineWidgets/AssistantWidget.swift",
      iosBotWidget,
      /Wireline Agents|Wireline Assistants|Text\("Agents"\)/,
    ],
  ]) {
    mustExclude(
      file,
      source,
      pattern,
      "visible native copy must not revive Agent or Assistant branding",
    );
  }
}
