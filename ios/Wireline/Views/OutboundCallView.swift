import SwiftUI

/// Manual outbound dial: pick an agent, enter a number + optional instruction,
/// and the backend dials via Vapi (`POST /api/mobile/calls/outbound`). Mirrors
/// the Siri intent for users who'd rather tap.
struct OutboundCallView: View {
    let agents: [Agent]
    @Environment(\.dismiss) private var dismiss

    @State private var selectedAgentId: String = ""
    @State private var number = ""
    @State private var context = ""
    @State private var consentConfirmed = false
    @State private var isPlacing = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Agent") {
                    Picker("Agent", selection: $selectedAgentId) {
                        ForEach(agents) { Text($0.name).tag($0.id) }
                    }
                }
                Section("Call") {
                    TextField("Phone number (+15551234567)", text: $number)
                        .keyboardType(.phonePad)
                    TextField("Instruction (optional)", text: $context, axis: .vertical)
                        .lineLimit(2...4)
                    Toggle("I have consent to call this number for this purpose.", isOn: $consentConfirmed)
                        .font(.footnote)
                }
                if let errorMessage {
                    Text(errorMessage).font(.footnote).foregroundStyle(Brand.destructive)
                }
                Section {
                    Button {
                        Task { await place() }
                    } label: {
                        if isPlacing { ProgressView().tint(.white) } else { Text("Place call") }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isPlacing || selectedAgentId.isEmpty || number.isEmpty || !consentConfirmed)
                    .listRowInsets(EdgeInsets())
                }
            }
            .navigationTitle("New call")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .tint(Brand.accent)
            .onAppear { if selectedAgentId.isEmpty { selectedAgentId = agents.first?.id ?? "" } }
        }
    }

    private func place() async {
        isPlacing = true
        errorMessage = nil
        defer { isPlacing = false }
        do {
            _ = try await WirelineAPI.shared.placeCall(
                agentId: selectedAgentId,
                to: number,
                context: context.isEmpty ? nil : context,
                hasExpressWrittenConsent: consentConfirmed
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
