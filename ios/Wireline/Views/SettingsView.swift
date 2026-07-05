import SwiftUI

/// App settings. Currently the callback number used for "take this call"
/// handoffs — iOS can't read the device's own number, so the user sets it.
struct SettingsView: View {
    @State private var handoffPhone = ""
    @State private var loaded = false
    @State private var isSaving = false
    @State private var savedNote: String?

    var body: some View {
        Form {
            Section {
                TextField("+15551234567", text: $handoffPhone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .accessibilityLabel("Callback phone number")
            } header: {
                Text("Callback number")
            } footer: {
                Text("When you take a live call, the agent transfers the caller to this number. Use E.164 format (e.g. +15551234567).")
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Save") }
                }
                .disabled(isSaving)
                if let savedNote {
                    Text(savedNote).font(.footnote).foregroundStyle(Brand.signal)
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .tint(Brand.accent)
        .task {
            guard !loaded else { return }
            loaded = true
            if let me = try? await WirelineAPI.shared.me() {
                handoffPhone = me.settings?.handoffPhone ?? ""
            }
        }
    }

    private func save() async {
        isSaving = true
        savedNote = nil
        defer { isSaving = false }
        do {
            let trimmed = handoffPhone.trimmingCharacters(in: .whitespaces)
            try await WirelineAPI.shared.setHandoffPhone(trimmed.isEmpty ? nil : trimmed)
            savedNote = "Saved."
        } catch {
            savedNote = "Couldn't save — check the number format."
        }
    }
}
