import SwiftUI

/// Explains the regular-iPhone entry points and how to wire the physical ones.
/// Apps cannot claim the Action button or Back Tap programmatically, so this
/// screen guides the user to Settings. Siri phrases and widgets are registered
/// by App Shortcuts.
struct ActivationSetupView: View {
    var body: some View {
        List {
            Section {
                row("mic.fill", "Siri", "Say “Ask BotBound”, or “Ask BotBound what needs my attention.” Works the moment the app is installed. No extra setup.")
            } header: { Text("Hands-free") }

            Section {
                row("button.horizontal.top.press", "Action button", "On iPhone 15 Pro and later, set the Action button to run the “Ask BotBound” shortcut for a walkie-talkie feel.")
                row("hand.tap.fill", "Back Tap", "Double- or triple-tap the back of your iPhone to ask BotBound or start a call.")
                Button { openSettings() } label: {
                    Label("Open Settings to assign them", systemImage: "gear")
                }
                .tint(Brand.accent)
            } header: {
                Text("Physical triggers")
            } footer: {
                Text("Action button: Settings → Action Button → Shortcut → Ask BotBound.\nBack Tap: Settings → Accessibility → Touch → Back Tap.")
            }

            Section {
                row("rectangle.stack.fill", "Home & Lock Screen widgets", "Add a BotBound widget to start a request or review what needs attention at a glance.")
                row("slider.horizontal.3", "Control Center", "Add the BotBound control for one-tap access from anywhere.")
                Button { openShortcuts() } label: {
                    Label("Open the Shortcuts app", systemImage: "square.2.layers.3d")
                }
                .tint(Brand.accent)
            } header: { Text("Glanceable") }

            Section {
                HStack {
                    row("applewatch", "Apple Watch", "Ask or approve from your wrist.")
                    Spacer()
                    Text("Soon").font(.caption).foregroundStyle(.secondary)
                }
            } header: { Text("Coming soon") }
        }
        .navigationTitle("Activate everywhere")
        .navigationBarTitleDisplayMode(.inline)
        .wirelineBrand()
    }

    private func row(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(Brand.accent)
                .frame(width: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(detail)")
    }

    private func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    private func openShortcuts() {
        if let url = URL(string: "shortcuts://"), UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
        }
    }
}

#Preview {
    NavigationStack { ActivationSetupView() }
}
