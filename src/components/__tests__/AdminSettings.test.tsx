import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminSettings from "../AdminSettings";
import { BrowserRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext";
import { BrandingProvider } from "../../contexts/BrandingContext";

// Mock authFetch
vi.mock("../lib/api", () => ({
  authFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ settings: {}, agents: [], numbers: [], members: [] }),
    }),
  ),
}));

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <BrandingProvider>
        <ToastProvider>{ui}</ToastProvider>
      </BrandingProvider>
    </BrowserRouter>,
  );
};

describe("AdminSettings Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the settings page with tabs", async () => {
    renderWithProviders(<AdminSettings />);

    expect(screen.getByText(/Admin · Configuration/i)).toBeInTheDocument();

    // Check for tabs
    expect(screen.getByText(/Branding/i)).toBeInTheDocument();
    expect(screen.getByText(/Carrier/i)).toBeInTheDocument();
    expect(screen.getByText(/Billing/i)).toBeInTheDocument();
    expect(screen.getByText(/Team/i)).toBeInTheDocument();
  });

  it("switches tabs when clicked", async () => {
    renderWithProviders(<AdminSettings />);

    const carrierTab = screen.getByRole("tab", { name: /Carrier/i });
    fireEvent.click(carrierTab);

    await waitFor(() => {
      expect(screen.getByText(/Wireline Voice Network/i)).toBeInTheDocument();
    });

    const billingTab = screen.getByRole("tab", { name: /Billing/i });
    fireEvent.click(billingTab);

    await waitFor(() => {
      expect(screen.getByText(/subscription state/i)).toBeInTheDocument();
    });
  });
});
