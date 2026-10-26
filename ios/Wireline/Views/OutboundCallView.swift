import SwiftUI

/// Manual outbound dial: pick an agent, enter a number + optional instruction,
/// and the backend dials via Twilio carrier transport and OpenAI Realtime SIP
/// (`POST /api/mobile/calls/outbound`). Mirrors the Siri intent for users who'd
/// rather tap.
struct OutboundCallView: View {
    let agents: [Agent]
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var selectedAgentId: String = ""
    @State private var number = ""
    @State private var context = ""
    @State private var callPurpose = OutboundPurposeCopy.appointment
    @State private var permissionConfirmed = false
    @State private var nonsalesConfirmed = false
    @State private var salesAttestationConfirmed = false
    @State private var isPlacing = false
    @State private var errorMessage: String?

    private var salesCall: Bool {
        callPurpose == OutboundPurposeCopy.sales
    }

    private var confirmationsReady: Bool {
        permissionConfirmed && (salesCall ? salesAttestationConfirmed : nonsalesConfirmed)
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
                    Picker("Why are you contacting them?", selection: $callPurpose) {
                        Text(OutboundPurposeCopy.appointmentLabel).tag(OutboundPurposeCopy.appointment)
                        Text(OutboundPurposeCopy.callbackLabel).tag(OutboundPurposeCopy.callback)
                        Text(OutboundPurposeCopy.salesLabel).tag(OutboundPurposeCopy.sales)
                    }
                    .onChange(of: callPurpose) { _ in
                        permissionConfirmed = false
                        nonsalesConfirmed = false
                        salesAttestationConfirmed = false
                    }
                    Toggle(OutboundConsentCopy.permission, isOn: $permissionConfirmed)
                    if salesCall {
                        Toggle(OutboundConsentCopy.salesAttestation, isOn: $salesAttestationConfirmed)
                    } else {
                        Toggle(OutboundConsentCopy.nonsales, isOn: $nonsalesConfirmed)
                    }
                    Button(OutboundConsentCopy.learnMore) {
                        openURL(OutboundConsentCopy.legalURL)
                    }
                    .font(.caption)
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
                    .disabled(isPlacing || selectedAgentId.isEmpty || number.isEmpty || !confirmationsReady)
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
                permissionConfirmed: permissionConfirmed,
                nonsalesConfirmed: salesCall ? false : nonsalesConfirmed,
                salesAttestationConfirmed: salesCall && salesAttestationConfirmed
            )
            dismiss()
        } catch let WirelineAPI.APIError.http(status, _) where status == 503 {
            errorMessage = "Calling from the iPhone app is not available yet. Open BotBound in the browser to place this call."
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
