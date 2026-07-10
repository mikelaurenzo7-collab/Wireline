/**
 * Native Android and iOS control surfaces — command-center tab models, the
 * shared Training/Wire IA, agent (never assistant/employee) language, and the
 * profit-agent sign-in promise on both platforms.
 */
export function checkNativeSurfaces({ read, mustInclude, mustExclude }) {
  const androidApp = read("android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt");
  const androidSetup = read("android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt");
  const iosRootTabs = read("ios/Wireline/Views/RootTabView.swift");
  const iosSignIn = read("ios/Wireline/Views/SignInView.swift");
  const iosWorkspace = read("ios/Wireline/Views/WorkspaceView.swift");
  const iosAgentLibrary = read("ios/Wireline/Views/AssistantLibraryView.swift");
  const iosTrainingWire = read("ios/Wireline/Views/AssistantSetupViews.swift");
  const iosCarPlay = read("ios/Wireline/CarPlay/CarPlaySceneDelegate.swift");
  const iosInfo = read("ios/Wireline/Info.plist");
  const iosWidgetInfo = read("ios/WirelineWidgets/Info.plist");
  const iosAssistantWidget = read("ios/WirelineWidgets/AssistantWidget.swift");
  const androidAssistantWidget = read(
    "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
  );

  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /object Studio : Screen\("studio", "Command"\)/,
    "Android app tab model must anchor on Command",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /object Assistants : Screen\("assistants", "Agents"\)/,
    "Android app tab model must use Agents",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /object Knowledge : Screen\("knowledge", "Train"\)/,
    "Android app tab model must use Train",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /object Actions : Screen\("actions", "Wire"\)/,
    "Android app tab model must use Wire",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /object Recaps : Screen\("recaps", "Calls"\)/,
    "Android app tab model must use Calls",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt",
    androidApp,
    /AI profit agents for appointments, lead revival, promotions, and follow-up\./,
    "Android sign-in must use the profit-agent landing promise",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
    androidSetup,
    /title = \{ Text\("Training"/,
    "Android setup page must be Training",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
    androidSetup,
    /title = \{ Text\("Wire"/,
    "Android actions page must be Wire",
  );
  mustInclude(
    "android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt",
    androidSetup,
    /WAYS YOUR AGENT CAN HELP/,
    "Android Wire screen must use agent language",
  );

  mustInclude(
    "ios/Wireline/Views/RootTabView.swift",
    iosRootTabs,
    /Label\("Command", systemImage: "rectangle\.grid\.2x2"\)/,
    "iOS tab bar must anchor on Command",
  );
  mustInclude(
    "ios/Wireline/Views/RootTabView.swift",
    iosRootTabs,
    /Label\("Agents", systemImage: "person\.2"\)/,
    "iOS tab bar must use Agents",
  );
  mustInclude(
    "ios/Wireline/Views/RootTabView.swift",
    iosRootTabs,
    /Label\("Train", systemImage: "book\.closed"\)/,
    "iOS tab bar must use Train",
  );
  mustInclude(
    "ios/Wireline/Views/RootTabView.swift",
    iosRootTabs,
    /Label\("Wire", systemImage: "bolt"\)/,
    "iOS tab bar must use Wire",
  );
  mustInclude(
    "ios/Wireline/Views/SignInView.swift",
    iosSignIn,
    /AI profit agents for appointments, lead revival, promotions, and follow-up\./,
    "iOS sign-in must use the profit-agent landing promise",
  );
  mustInclude(
    "ios/Wireline/Views/WorkspaceView.swift",
    iosWorkspace,
    /Metric\(title: "Agents"/,
    "iOS workspace must show Agents metric",
  );
  mustInclude(
    "ios/Wireline/Views/AssistantLibraryView.swift",
    iosAgentLibrary,
    /navigationTitle\("Agents"\)/,
    "iOS agent library title must be Agents",
  );
  mustInclude(
    "ios/Wireline/Views/AssistantSetupViews.swift",
    iosTrainingWire,
    /navigationTitle\("Training"\)/,
    "iOS setup page must be Training",
  );
  mustInclude(
    "ios/Wireline/Views/AssistantSetupViews.swift",
    iosTrainingWire,
    /navigationTitle\("Wire"\)/,
    "iOS actions page must be Wire",
  );
  mustInclude(
    "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
    iosCarPlay,
    /titleVariants: \["Agents", "Choose a line"\]/,
    "CarPlay must expose agent lines as Agents",
  );
  mustInclude(
    "ios/Wireline/CarPlay/CarPlaySceneDelegate.swift",
    iosCarPlay,
    /CPListTemplate\(title: "Agents"/,
    "CarPlay agent list title must be Agents",
  );

  mustExclude(
    "ios/Wireline/Info.plist",
    iosInfo,
    /Wireline Assistant|assistants/i,
    "iOS visible permission copy must use Wireline and agents",
  );
  mustExclude(
    "ios/WirelineWidgets/Info.plist",
    iosWidgetInfo,
    /Wireline Assistant/i,
    "iOS widget display name must be Wireline",
  );
  mustExclude(
    "ios/WirelineWidgets/AssistantWidget.swift",
    iosAssistantWidget,
    /Assistant Coverage|Text\("Assistant"\)|Wireline Precision/i,
    "iOS widget visible copy must use agent language",
  );
  mustExclude(
    "android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt",
    androidAssistantWidget,
    /Wireline Assistants/,
    "Android widget visible copy must use agent language",
  );

  for (const [file, source] of [
    ["android/app/src/main/java/com/wireline/app/ui/WirelineAndroidApp.kt", androidApp],
    ["android/app/src/main/java/com/wireline/app/ui/setup/SetupScreens.kt", androidSetup],
    ["ios/Wireline/Views/SignInView.swift", iosSignIn],
    ["ios/Wireline/Views/AssistantSetupViews.swift", iosTrainingWire],
    ["ios/WirelineWidgets/AssistantWidget.swift", iosAssistantWidget],
    ["android/app/src/main/java/com/wireline/app/widget/AssistantWidgetProvider.kt", androidAssistantWidget],
  ]) {
    mustExclude(
      file,
      source,
      /phone employees?/i,
      "native surfaces must not carry retired phone-employee positioning",
    );
  }
}
