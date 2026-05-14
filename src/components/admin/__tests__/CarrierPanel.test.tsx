import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CarrierPanel } from "../CarrierPanel";

// Mock child components
vi.mock("../../WebhooksManager", () => ({
  default: () => <div data-testid="webhooks-manager">WebhooksManager</div>,
}));
vi.mock("../../IntakeKeysManager", () => ({
  default: () => <div data-testid="intake-keys-manager">IntakeKeysManager</div>,
}));

describe("CarrierPanel", () => {
  const mockSettings = {
    vapi_phone_number_id: "test-id",
    vapi_phone_inbound_agent_id: "agent-1",
    voice_llm_provider: "google",
    voice_llm_model: "gemini-1.5-flash",
    twilio_messaging_enabled: true,
    twilio_lookup_enabled: false,
    twilio_manager_alerts_enabled: false,
    twilio_messaging_service_sid: "",
    twilio_sms_from_number: "",
    twilio_whatsapp_from_number: "",
    twilio_manager_alert_number: "",
  };

  const mockAgents = [
    { id: "agent-1", name: "Riley", channel: "voice" },
    { id: "agent-2", name: "Alex", channel: "voice" },
  ];

  const mockPhoneNumbers = [
    { id: "1", phone_number: "+15551234567", vapi_number_id: "vapi-1", agent_id: "agent-1" },
  ];

  const defaultProps = {
    settings: mockSettings,
    agents: mockAgents,
    phoneNumbers: mockPhoneNumbers,
    carrierNumbers: [],
    isSaving: false,
    isSyncing: false,
    onUpdateSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onSyncNumbers: vi.fn(),
    onAddNumber: vi.fn(),
    onDeleteNumber: vi.fn(),
    onUpdateNumberAgent: vi.fn(),
  };

  it("renders the carrier network and phone numbers sections", () => {
    render(<CarrierPanel {...defaultProps} />);
    
    expect(screen.getByText(/Wireline Voice Network/i)).toBeInTheDocument();
    expect(screen.getByText(/Wireline Phone Numbers/i)).toBeInTheDocument();
    expect(screen.getByText("+15551234567")).toBeInTheDocument();
  });

  it("calls onUpdateSettings when phone number ID changes", () => {
    render(<CarrierPanel {...defaultProps} />);
    
    const input = screen.getByLabelText(/Default Wireline phone number ID/i);
    fireEvent.change(input, { target: { value: "new-id" } });
    
    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      vapi_phone_number_id: "new-id"
    }));
  });

  it("calls onSyncNumbers when sync button is clicked", () => {
    render(<CarrierPanel {...defaultProps} />);
    
    const syncBtn = screen.getByText(/Sync numbers/i);
    fireEvent.click(syncBtn);
    
    expect(defaultProps.onSyncNumbers).toHaveBeenCalled();
  });

  it("calls onAddNumber when register button is clicked", () => {
    render(<CarrierPanel {...defaultProps} />);
    
    const numInput = screen.getByPlaceholderText("+1 800 555 0100");
    const idInput = screen.getByPlaceholderText("Wireline voice number ID");
    const registerBtn = screen.getByText(/Register number/i);
    
    fireEvent.change(numInput, { target: { value: "+1234567890" } });
    fireEvent.change(idInput, { target: { value: "vapi-new" } });
    fireEvent.click(registerBtn);
    
    expect(defaultProps.onAddNumber).toHaveBeenCalledWith("+1234567890", "vapi-new");
  });
});
