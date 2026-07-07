import SwiftUI

/// Manual outbound dial: pick an agent, enter a number + optional instruction,
/// and the backend dials via Vapi (`POST /api/mobile/calls/outbound`). Mirrors
/// the Siri intent for users who'd rather tap.
struct OutboundCallView: View {
    let agents: [Agent]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var selectedAgentId: String = ""
    @State private var number = ""
    @State private var context = ""
    @State private var callPurpose = "service_or_requested"
    @State private var consentConfirmed = false
    @State private var isPlacing = false
    @State private var errorMessage: String?

    private var requiresMarketingConsent: Bool {
        callPurpose == "marketing_or_sales"
    }

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
                    Picker("Call type", selection: $callPurpose) {
                        Text("Service").tag("service_or_requested")
                        Text("Callback").tag("callback")
                        Text("Marketing").tag("marketing_or_sales")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: callPurpose) { _ in consentConfirmed = false }
                    if requiresMarketingConsent {
                        Toggle(isOn: $consentConfirmed) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(OutboundConsentCopy.label)
                                    .font(.footnote)
                                Text(OutboundConsentCopy.help)
                                    .font(.caption)
                                    .foregroundStyle(Brand.text2)
                                Button(OutboundConsentCopy.learnMore) {
                                    openURL(OutboundConsentCopy.legalURL)
                                }
                                .font(.caption)
                            }
                        }
                    }
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
                    .disabled(
                        isPlacing ||
                            selectedAgentId.isEmpty ||
                            number.isEmpty ||
                            (requiresMarketingConsent && !consentConfirmed)
                    )
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
                callPurpose: callPurpose,
                hasExpressWrittenConsent: requiresMarketingConsent && consentConfirmed
            )
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
