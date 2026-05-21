import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { CarrierPanel } from "../CarrierPanel";

// Mock child components
vi.mock("../../WebhooksManager", () => ({
  default: () => <div data-testid="webhooks-manager">WebhooksManager</div>,
}));
vi.mock("../../IntakeKeysManager", () => ({
  default: () => <div data-testid="intake-keys-manager">IntakeKeysManager</div>,
}));
vi.mock("../../PhoneNumberPicker", () => ({
  default: ({ onClaim }: { onClaim?: (phoneNumber: string) => void }) => (
    <button type="button" onClick={() => onClaim?.("+15557654321")}>
      Claim test number
    </button>
  ),
}));

describe("CarrierPanel", () => {
  const mockSettings = {
    vapi_phone_number_id: "test-id",
    vapi_phone_inbound_agent_id: "agent-1",
    voice_llm_provider: "google",
    voice_llm_model: "gemini-3-flash-preview",
    twilio_messaging_enabled: true,
    twilio_lookup_enabled: false,
    twilio_manager_alerts_enabled: false,
    twilio_messaging_service_sid: "",
    twilio_sms_from_number: "",
    twilio_whatsapp_from_number: "",
    twilio_manager_alert_number: "",
    subscription_status: "active",
    max_agents: 3,
    prospecting_enabled: false,
    target_titles: [],
    target_industries: [],
    target_states: [],
    target_employee_ranges: ["1,10", "11,50"],
    brand_name: "",
    brand_logo_url: "",
    primary_color: "#4F1E7B",
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

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

    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        vapi_phone_number_id: "new-id",
      }),
    );
  });

  it("calls onSyncNumbers when sync button is clicked", () => {
    render(<CarrierPanel {...defaultProps} />);

    const syncBtn = screen.getByText(/Sync numbers/i);
    fireEvent.click(syncBtn);

    expect(defaultProps.onSyncNumbers).toHaveBeenCalled();
  });

  it("syncs phone numbers after a pool number is claimed", () => {
    render(<CarrierPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /claim test number/i }));

    expect(defaultProps.onSyncNumbers).toHaveBeenCalled();
  });

  it("calls onUpdateNumberAgent when a line is assigned to a voice agent", () => {
    render(<CarrierPanel {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/Assign agent to \+15551234567/i), {
      target: { value: "agent-2" },
    });

    expect(defaultProps.onUpdateNumberAgent).toHaveBeenCalledWith("1", "agent-2");
  });

  it("calls onDeleteNumber when a line delete button is clicked", () => {
    render(<CarrierPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /delete \+15551234567/i }));

    expect(defaultProps.onDeleteNumber).toHaveBeenCalledWith("1");
  });

  it("calls onAddNumber when register button is clicked", () => {
    render(<CarrierPanel {...defaultProps} />);

    // The page now has two inputs with the +1 800 555 0100 placeholder
    // (Voice register form + SMS-from setting). Disambiguate by picking
    // the tel input that is NOT the twilio-sms-from row.
    const telInputs = screen.getAllByPlaceholderText("+1 800 555 0100");
    const numInput = telInputs.find((el) => el.id !== "twilio-sms-from")!;
    const idInput = screen.getByPlaceholderText("Wireline voice number ID");
    const registerBtn = screen.getByText(/Register number/i);

    fireEvent.change(numInput, { target: { value: "+1234567890" } });
    fireEvent.change(idInput, { target: { value: "vapi-new" } });
    fireEvent.click(registerBtn);

    expect(defaultProps.onAddNumber).toHaveBeenCalledWith("+1234567890", "vapi-new");
  });

  it("updates SMS sender and toggles outbound SMS settings", () => {
    render(<CarrierPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { pressed: true }));
    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twilio_messaging_enabled: false }),
    );

    fireEvent.change(screen.getByLabelText(/SMS sender number/i), {
      target: { value: "+15550001111" },
    });
    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twilio_sms_from_number: "+15550001111" }),
    );
  });

  it("reveals and updates manager alert number when operator alerts are enabled", () => {
    render(
      <CarrierPanel
        {...defaultProps}
        settings={{ ...mockSettings, twilio_manager_alerts_enabled: true }}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Your phone number/i), {
      target: { value: "+15559990000" },
    });

    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ twilio_manager_alert_number: "+15559990000" }),
    );
  });
});
