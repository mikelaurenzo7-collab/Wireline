import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SubscriptionPanel } from "../SubscriptionPanel";

// Mock child components
vi.mock("../../StripeBillingCard", () => ({
  default: () => <div data-testid="stripe-billing-card">StripeBillingCard</div>,
}));

describe("SubscriptionPanel", () => {
  const mockSettings = {
    subscription_status: "active",
    max_agents: 5,
  };

  const defaultProps = {
    settings: mockSettings,
    isSaving: false,
    onUpdateSettings: vi.fn(),
    onSaveSettings: vi.fn(),
    onDeleteAccount: vi.fn(),
  };

  it("renders the billing card and simulator sections", () => {
    render(<SubscriptionPanel {...defaultProps} />);
    
    expect(screen.getByTestId("stripe-billing-card")).toBeInTheDocument();
    expect(screen.getByText(/subscription state/i)).toBeInTheDocument();
  });

  it("calls onUpdateSettings when operational state button is clicked", () => {
    render(<SubscriptionPanel {...defaultProps} />);
    
    const suspendedBtn = screen.getByText(/Suspended/i);
    fireEvent.click(suspendedBtn);
    
    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      subscription_status: "past_due"
    }));
  });

  it("calls onUpdateSettings when max agents range changes", () => {
    render(<SubscriptionPanel {...defaultProps} />);
    
    const range = screen.getByRole("slider");
    fireEvent.change(range, { target: { value: "10" } });
    
    expect(defaultProps.onUpdateSettings).toHaveBeenCalledWith(expect.objectContaining({
      max_agents: 10
    }));
  });

  it("calls onDeleteAccount when delete button is clicked with correct text", async () => {
    render(<SubscriptionPanel {...defaultProps} />);
    
    const input = screen.getByPlaceholderText("DELETE MY ACCOUNT");
    const deleteBtn = screen.getByText(/Delete my account/i);
    
    fireEvent.change(input, { target: { value: "DELETE MY ACCOUNT" } });
    fireEvent.click(deleteBtn);
    
    expect(defaultProps.onDeleteAccount).toHaveBeenCalledWith("DELETE MY ACCOUNT");
  });
});
